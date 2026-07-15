// M2 T2.1:SkillInstance 状态机(对应 types.ts 的契约)
//
// 状态转移:
//   cast(前摇) -> active(生效) -> recovery(后摇) -> done
// 同一时刻只允许一个 active SkillInstance;新施法时由 caller 决定是否取消旧的
// (proposal §5.2:可中断 — 现实用 cancel())
//
// 关键不变量:
//  - cast 阶段不结算伤害,active 阶段每 tick 用 hit shape 计算
//  - displacement='dash' 一次性把 caster 推到 origin + forward*dashDistance
//    (遇墙停由 caller 在调用前用 pushOutOfBounds 处理,M2 不内置碰撞)
//  - cooldownTimer 在 onCast 立即置为 cooldown；done 后仍需由上层持续 tick 到 0
//  - cancel():任意阶段直接置 done,后续 tick 立刻返回
import type {
  DamageResult,
  Hit,
  HitShape,
  Skill,
  SkillContext,
  SkillInstance,
  Unit,
  WorldLike,
} from './types';
import { resolveHits } from './hits';
import { vec2Add, type Vec2 } from './vec2';

export interface CastOptions {
  /** 施法时朝向(rad);0 = world -Z */
  forwardRad: number;
  /** 施法原点;缺省用 caster.position */
  origin?: Vec2;
}

/** 创建一个 SkillInstance。caller 负责把它推进到 world.activeSkill,
 *  并在每帧 loop tick 里调 instance.tick(dt, ctx) */
export function startSkill(
  skill: Skill,
  caster: Unit,
  opts: CastOptions,
): SkillInstance {
  const origin = opts.origin ?? caster.position;
  const forward = opts.forwardRad;
  let damageTicksDone = 0;
  let intervalDamageAccum = 0;
  /** 非 interval 技能:active 内只结算一次命中 */
  let singleHitResolved = false;
  const inst: SkillInstance = {
    skill,
    phase: 'cast',
    elapsed: 0,
    cooldownTimer: skill.cooldown,
    origin,
    forwardRad: forward,
    damage: [],
    cancel() {
      inst.phase = 'done';
      inst.elapsed = 0;
    },
    tick(dt: number, ctx: SkillContext) {
      // KI-1:cooldownTimer 跨 done 后仍持续减 dt,直到 ≤ 0 时由 caller 解除施法拦截
      // (见 GameCanvas.onKeyDown)。必须放在 done 早返之前,否则 done 之后 CD 永远卡住。
      if (inst.cooldownTimer > 0) {
        const remaining = inst.cooldownTimer - dt;
        inst.cooldownTimer = remaining <= 1e-9 ? 0 : remaining;
      }
      if (inst.phase === 'done') return inst.damage;
      inst.elapsed += dt;
      // 每阶段持续时间到 → 推进到下一阶段
      // cast/active 阶段结束立即进入下一阶段的逻辑写在同 tick:
      // 避免"施法 → 生效"多 1 tick 出现手感迟滞
      if (inst.phase === 'cast' && inst.elapsed >= skill.castTime) {
        inst.phase = 'active';
        inst.elapsed = 0;
        singleHitResolved = false;
        if (skill.displacement === 'dash' && skill.dashDistance > 0) {
          applyDash(caster, inst.origin, forward, skill.dashDistance);
        }
        // T35.2:进入 active 时回调一次(契约之盾等挂 buff)
        skill.onActivate?.(ctx);
      }
      if (inst.phase === 'active') {
        const useInterval =
          skill.damageInterval !== undefined &&
          skill.damageTicks !== undefined &&
          skill.damageInterval > 0 &&
          skill.damageTicks > 0;

        if (useInterval) {
          inst.damage = [];
          intervalDamageAccum += dt;
          const results: DamageResult[] = [];
          while (
            damageTicksDone < skill.damageTicks! &&
            intervalDamageAccum >= (damageTicksDone + 1) * skill.damageInterval!
          ) {
            const hits = resolveHits(
              ctx.world as WorldLike,
              caster,
              skill.hit,
              forward,
            );
            if (skill.damage) {
              for (const h of hits) {
                const r = skill.damage(ctx, h);
                if (r) results.push(r);
              }
            }
            damageTicksDone += 1;
          }
          if (results.length > 0) inst.damage = results;
        } else if (!singleHitResolved) {
          const hits = resolveHits(
            ctx.world as WorldLike,
            caster,
            skill.hit,
            forward,
          );
          const results: DamageResult[] = [];
          if (skill.damage) {
            for (const h of hits) {
              const r = skill.damage(ctx, h);
              if (r) results.push(r);
            }
          }
          inst.damage = results;
          singleHitResolved = true;
        } else {
          inst.damage = [];
        }

        if (inst.elapsed >= skill.activeTime) {
          if (skill.onLand) {
            const landResults = skill.onLand(ctx);
            if (landResults.length > 0) {
              inst.damage = [...inst.damage, ...landResults];
            }
          }
          inst.phase = 'recovery';
          inst.elapsed = 0;
        }
      }
      if (inst.phase === 'recovery' && inst.elapsed >= skill.recoveryTime) {
        inst.phase = 'done';
        inst.elapsed = 0;
      }
      return inst.damage;
    },
  };
  return inst;
}

function applyDash(
  caster: Unit,
  origin: Vec2,
  forwardRad: number,
  distance: number,
): void {
  // 约定:forwardRad=0 ≡ world -Z;forward 单位向量 = (sin f, -cos f)
  // final = origin + forward * distance
  caster.position = vec2Add(origin, {
    x: Math.sin(forwardRad) * distance,
    z: -Math.cos(forwardRad) * distance,
  });
}

/** 简化 DamageFormula:目标可见才结算;不处理暴击/护盾(M3 亚瑟再扩) */
export function simpleDamage(
  amount: number,
  ignoreVisibility = false,
): (ctx: SkillContext, hit: Hit) => DamageResult | null {
  return (ctx, hit) => {
    if (!hit.target) return null;
    if (!ignoreVisibility && !ctx.world.canSee(ctx.caster, hit.target)) {
      return null;
    }
    return { targetId: hit.target.id, damage: amount, isCrit: false };
  };
}

/** 应用伤害结果到单位(扣血);caller 决定是否触发飘字/光圈闪烁 */
export function applyDamage(units: Iterable<Unit>, results: readonly DamageResult[]): void {
  const map = new Map<string, Unit>();
  for (const u of units) map.set(u.id, u);
  for (const r of results) {
    const u = map.get(r.targetId);
    if (!u) continue;
    u.hp = Math.max(0, u.hp - r.damage);
  }
}

/** 工厂:辅助方法,提供给英雄装载用 */
export function makeSkill(partial: {
  id: string;
  displayName: string;
  hit: HitShape;
  displacement?: Skill['displacement'];
  castTime: number;
  activeTime: number;
  recoveryTime: number;
  cooldown: number;
  dashDistance?: number;
  damage?: Skill['damage'];
  damageInterval?: number;
  damageTicks?: number;
  /** 缺省 'instant',兼容 M3 现有 4 技能 */
  castMode?: Skill['castMode'];
  onActivate?: Skill['onActivate'];
  onLand?: Skill['onLand'];
}): Skill {
  return {
    id: partial.id,
    displayName: partial.displayName,
    hit: partial.hit,
    displacement: partial.displacement ?? 'none',
    castTime: partial.castTime,
    activeTime: partial.activeTime,
    recoveryTime: partial.recoveryTime,
    cooldown: partial.cooldown,
    dashDistance: partial.dashDistance ?? 0,
    damage: partial.damage,
    damageInterval: partial.damageInterval,
    damageTicks: partial.damageTicks,
    castMode: partial.castMode ?? 'instant',
    onActivate: partial.onActivate,
    onLand: partial.onLand,
  };
}
