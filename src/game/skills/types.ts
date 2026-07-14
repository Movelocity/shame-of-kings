// proposal-v2.md §3 G2 闸口
// Skill 框架核心类型:M2 阶段实现运行时 + 命中盒,本文件先定契约
// 关键约定(都来自 proposal §5.2 与本提案 §3 G2):
//  - 5 类命中盒:self / circle / rect / cone / target
//  - 位移方式:ground(沿平面滑动,可斜撞)/ dash(一次性突进,遇墙停),**无 y±**
//  - SkillContext.caster 用 Unit | TowerUnit 联合类型:T3 接 Unit,
//    P2 T5C.4 接 TowerUnit,闸口先定型
//  - DamageFormula 接收 (ctx, hit),自动处理 target.hidden:
//    视野外(草丛/墙后)目标不可被命中
//  - SkillInstance 可中断(被 reset / 被打断技能时清空):M2 T2.1 实现状态机时落实

import type { Vec2 } from './vec2';

/** 命中盒类型(proposal §5.2 锁的最小集合) */
export type HitShape =
  | { kind: 'self' }
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; halfWidth: number; halfDepth: number }
  | { kind: 'cone'; range: number; halfAngleRad: number; forwardRad: number }
  | { kind: 'target'; range: number };

/** 位移方式(proposal §5.2 锁定,不允许 y±) */
export type Displacement = 'ground' | 'dash' | 'none';

export type Team = 'blue' | 'red' | 'neutral';

export interface HiddenState {
  /** 草丛遮挡:草丛内对外不可见 */
  inBush: boolean;
  /** 视野半径外/墙后:对特定观察者不可见 */
  outOfVisionFrom: ReadonlySet<string>;
}

/**
 * Unit 基类契约。M3 T3.2 的 PracticeDummy 与 T3.1 的亚瑟共用。
 * P2 T5C.4 的 TowerUnit / JungleMob 复用同套字段 + 自己的扩展。
 */
export interface Unit {
  readonly id: string;
  readonly team: Team;
  position: Vec2;
  hp: number;
  hpMax: number;
  isStatic: boolean; // 木人桩 / 防御塔为 true
  hidden: HiddenState;
}

/**
 * TowerUnit 扩展(防御塔)契约。P2 T5C.4 实现时落具体类,
 * 这里只声明闸口要承担的字段。P2 之前不会有 TowerUnit 实例存在,
 * 但 SkillContext.caster 提前把联合类型写出来,免得 P2 改 engine。
 */
export interface TowerUnit extends Unit {
  readonly range: number;
  readonly attackInterval: number;
  /** 上次攻击时间戳(world tick,ms);P2 阶段维护 */
  lastAttackAt: number;
}

/** 命中结算结果(由 hits.ts 计算后交给 DamageFormula) */
export interface Hit {
  /** 被打中的目标;null = 未命中 */
  target: Unit | null;
  /** 技能施法者原点;命中盒以此为基准 */
  origin: Vec2;
  /** 朝向(世界 -Z = 0,逆时针为正) */
  forwardRad: number;
}

/** 视野过滤后的命中结果(由 DamageFormula 内部处理) */
export interface DamageResult {
  targetId: string;
  /** 最终伤害;0 = 命中但被视野/无敌/护盾抵消 */
  damage: number;
  isCrit: boolean;
}

/** 伤害公式契约。
 *  - 必须自己检查 target.hidden(视野外返回 0 伤害,而不是抛错)
 *  - 不修改 target 字段,只返回 DamageResult;真正扣血由 caller 负责
 */
export type DamageFormula = (ctx: SkillContext, hit: Hit) => DamageResult | null;

/** 技能运行时上下文(由 world 喂入) */
export interface SkillContext {
  caster: Unit | TowerUnit;
  world: WorldLike;
  /** 帧号或 world tick,毫秒;P2 起用于塔的 attackInterval */
  now: number;
}

/** World 抽象(避免 skills/ 反向依赖 world/ 的具体类)。
 *  M2 T2.1 实现时给出最小 set:P2 阶段继续扩展。 */
export interface WorldLike {
  /** 获取所有可被命中的单位(同阵营或中立过滤由调用方决定) */
  unitsNear(origin: Vec2, radius: number): readonly Unit[];
  /** P2 T5C.3 提供:目标对施法者是否可见 */
  canSee(observer: Unit | TowerUnit, target: Unit): boolean;
}

/** 技能定义(数据驱动;具体技能在 heroes/ 或 debug-skills/ 下) */
export interface Skill {
  readonly id: string;
  readonly displayName: string;
  readonly hit: HitShape;
  readonly displacement: Displacement;
  /** 前摇(秒) */
  readonly castTime: number;
  /** 生效(秒);命中盒在此阶段每 tick 结算 */
  readonly activeTime: number;
  /** 后摇(秒) */
  readonly recoveryTime: number;
  /** 冷却(秒);前摇开始时立即入 CD */
  readonly cooldown: number;
  /** 位移距离(世界单位);'none' 时忽略 */
  readonly dashDistance: number;
  /** 伤害公式;undefined = 无伤害(如纯位移) */
  readonly damage?: DamageFormula;
}

/** 技能运行实例(由 Skill.onCast 返回,M2 T2.1 落实) */
export interface SkillInstance {
  readonly skill: Skill;
  /** 当前阶段 */
  phase: 'cast' | 'active' | 'recovery' | 'done';
  /** 阶段累计已用时间(秒) */
  elapsed: number;
  /** 冷却剩余(秒);cooldownTimer > 0 时不允许再次施法 */
  cooldownTimer: number;
  /** 施法原点(锁定,位移以此刻位置为基准) */
  origin: Vec2;
  /** 施法时朝向(命中盒用) */
  forwardRad: number;
  /** 中断接口:reset / 被打断技能时调,直接 phase='done' */
  cancel(): void;
  /** 推进一帧 dt;返回本帧新结算的伤害(可空数组) */
  tick(dt: number, ctx: SkillContext): readonly DamageResult[];
}
