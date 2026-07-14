# Web MOBA — 手法练习场提案(MVP v2)

> **项目本质**:这不是一个全功能 MOBA,**是一个手机浏览器上离线练英雄手法的练习场**。
> 设备:**移动端为主**,桌面端仅作调试。
>
> 本提案固化 MVP 范围、技术底座、里程碑;

---

## 1. 项目定义(已修正)

### 1.1 一句话定位
一个**手机浏览器离线运行**的 MOBA 技能练习场,支持虚拟摇杆 + 技能按钮的触屏操作;MVP 是**亚瑟在木人桩上反复释放 3 个技能并自由重置**;后续扩展到元歌、镜等机制型英雄。

### 1.2 关键决策(已锁定)

| 决策点 | 选择 | 理由 |
|---|---|---|
| 第一刀英雄 | **亚瑟** | 战士,3 主动 + 1 被动,机制相对简单;先验证"练习场 + 技能框架"基建,不动复杂的双单位/多单位切换 |
| 操作范式 | **方案 a:虚拟摇杆(左下)+ 技能按钮(右下)** | 王者荣耀/原神风格,玩家熟悉;左手占屏幕,技能按钮单点+滑动指示 |
| 录像回放 | **不做** | MVP 内不投入;若元歌阶段用户回报"对出错步骤很模糊"再启动 |
| 运行模式 | **纯前端 Demo / 学习项目** | 无后端、无账号、无联机 |
| 玩法循环 | **木人桩 + 一键重置**(不做 AI 对手) | 练手法需要"可重复起点",AI 反而是干扰 |

### 1.3 范围边界

| 维度 | MVP 内 | 不在 MVP 内 |
|---|---|---|
| 设备 | 移动端浏览器(iOS Safari + Android Chrome)+ 桌面端调试 | 平板专属布局、桌面端"主玩法" |
| 网络 | 离线运行,无后端 | 联机、回放上传、分享 |
| 玩法 | 木人桩练习 + 一键重置 | 匹配、对线、推塔、兵线 |
| 美术 | 像素画程序生成 | 手绘 tileset、Aseprite 工作流 |
| 工程化 | TS + Vite + 单测覆盖技能框架 | CI/CD、PWA、Service Worker |

### 1.4 明确不做
- 找路、点击寻路、巡逻式 AI、兵线、塔、装备、商店、铭文、英雄选择界面
- 桌面端的"鼠标点击寻路"功能(只保留为开发期手动测试入口,**不放进用户路径**)
- 录像回放、时间轴、对比回放
- 竖屏游玩:**首页必须点击才能进入游戏**;游戏页若检测到竖屏会**先转横屏再渲染**,不会"半屏勉强渲染"

### 1.5 锁横屏全屏策略(已锁定)

> 写进 MVP,**不是可选项**。iOS Safari 等移动浏览器禁止"用户交互前自动全屏/锁定方向",所以必须有"开始游戏"按钮作为一次性用户互动钩子。

**三状态机**:
| State | 触发 | 行为 |
|---|---|---|
| `home` | 进入应用 + `isMobileUA()` 为 true | 显示"开始游戏"按钮;其他 UI 隐藏 |
| `transitioning` | 玩家点击"开始游戏" | 调用 `screen.orientation.lock('landscape')`(失败则软降级到 CSS 横屏)+ 请求全屏 |
| `play` | 转屏到位 + 全屏成功(或软降级完成) | 挂载 Three.js,正式进入游戏循环 |
| `play-portrait-fallback` | `orientationchange` 但 lock 失败 | 显示"请旋转设备"全屏遮罩,**不渲染 Three.js** |

**关键路径**:
1. 进入应用立即 `isMobileUA()` 判断 → 决定显示 home 还是直接进桌面调试版。
2. 桌面端跳过 home,直接 `play`(桌面不需要按钮触发全屏)。
3. `screen.orientation.lock('landscape')` 在 iOS 16+ / Chrome 84+ 支持;失败不报红,只是不锁定,改 CSS 横屏兜底。
4. 游戏页刷新若检测到竖屏,**挂载 Three.js 之前阻塞**,等 `matchMedia('(orientation: landscape)')` 为 true 才渲染。

---

## 2. 关键技术决策

### 2.1 技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| 语言 | TypeScript (strict) | 多个技能/单位类型,重构需要安全网 |
| 构建 | Vite | 与 TS + React 适配好,启动快 |
| UI 框架 | React 18 | 仅用于 HUD(摇杆/技能按钮/血条/设置) |
| 3D 引擎 | Three.js (r160+),**不用 R3F** | 见 §2.2 |
| 渲染相机 | **PerspectiveCamera,Fov 60,固定角度跟随玩家**(俯角约 45° 锁死,双指缩放改 FOV 或距离) | 王者/LoL 风:Qarter View + Follow;非 Top-down 也非 Free Orbit |
| 触屏输入 | 原生 Pointer Events(`pointerdown/move/up/cancel` + `touch-action: none`) | 不引入 react-use-gesture,理由:摇杆逻辑简单、自己写更可控 |
| 状态管理 | Zustand | HUD 订阅战斗状态;游戏循环不直接调 React |
| 测试 | Vitest | 技能框架 + 摇杆标量化必须有单测 |
| Lint/格式 | ESLint + Prettier | |

### 2.2 架构原则(5 条,逐条不妥协)

1. **渲染与逻辑分离**:Three.js Scene 只画;伤害/命中/移动/AI 在纯 TS 模块,可独立单测。
2. **固定时间步长 (Fixed timestep, 60 Hz 逻辑 / 可变渲染)**:触屏设备的帧率波动大,固定步长防止按技能时手感漂浮。
3. **数据驱动**:英雄、技能、地图都用 JSON / TS 常量声明,**亚瑟 → 元歌 → 镜切换不应改逻辑代码**。
4. **状态可序列化**:`WorldState` 单一入口/出口,后续接联机/回放仅换传输/存储层。
5. **输入归一**:摇杆值、点击、技能释放全部归一为 `InputState`,**不直接调 Three.js**;输入系统是游戏循环的输入源。

### 2.3 项目目录

```
web-moba/
├── src/
│   ├── engine/            # 与英雄/地图无关的底层
│   │   ├── renderer/      # Three.js Scene、PerspectiveCamera、固定角度跟随玩家、双指 zoom(改 FOV)
│   │   ├── loop/          # RAF + 固定步长调度器
│   │   ├── input/         # Pointer/Mouse → InputState 归一化
│   │   └── pixel/         # Canvas2D 离屏绘图 → 贴图
│   ├── game/              # 内容层
│   │   ├── world/         # WorldState 类型 + 序列化
│   │   ├── units/         # Unit 基类、Hero、PracticeDummy
│   │   ├── skills/        # Skill 框架、命中盒、伤害公式
│   │   ├── heroes/        # 亚瑟、元歌、镜的"技能数据 + 行为"
│   │   └── data/          # 地图、英雄配置 JSON
│   ├── ui/                # React HUD
│   │   ├── store/         # Zustand stores
│   │   └── components/    # Joystick、SkillButton、HpBar、DummyHpBar、ResetButton、Settings
│   ├── platform/          # 移动端适配
│   │   ├── viewport.ts    # iOS safe area、地址栏、DPR
│   │   └── gestures.ts    # 阻止浏览器默认手势(双指缩放/下拉刷新)
│   └── main.tsx
├── tests/                 # Vitest 单测(技能/摇杆/伤害)
├── public/
├── index.html             # viewport meta + ios 适配
├── vite.config.ts
├── tsconfig.json
└── proposal.md
```

> **关键决策点**:`heroes/` 是独立目录,因为亚瑟/元歌/镜就是三个并列的"技能模组",**新增英雄不应动 `skills/` 之外的逻辑**。

---

## 3. MVP 范围(第一个能跑起来的版本)

### 3.1 MVP DoD — 30 秒/在手机上/验证清单

打开页面,在主流手机上(iOS Safari / Android Chrome,**最近 2 代旗舰**),30 秒内可完成:

1. 看到一张 **Arena**(练习场:矩形 + 硬墙边界);场上 1 个出生点 + 1 个木人桩 + 1-2 个柔化圆角长方体障碍(供玩家绕位)。
2. **左下虚拟摇杆**拖动后,玩家单位按摇杆方向实时移动。
3. **右下 3 个技能按钮**(亚瑟 1/2/3 技能,大按钮 + 小图标均可);按下 → 冷却转圈 → 可再按。
4. 木人桩有血条,被技能打到血量下降,**伤害飘字**显示数字与暴击(看得出)。
5. 一键 **重置按钮**(屏幕中上),按下后玩家回到出生点,木人桩满血,所有 CD 清零。
6. **双指缩放**改相机距离(Fov 40–80,接近拉近/拉远);默认 Fov 60,玩家位置处于镜头下方约 45° 俯角。
7. 在 iPhone 13 / 小米 12 这档机型上 ≥ 30 fps(目标 iPad Pro / 高端机 ≥ 60)。
8. 不掉线、不白屏。**强横屏**:首页必须有"开始游戏"按钮触发横屏全屏;游戏页若检测到移动端 UA 且当前竖屏,必须**等转横屏完毕再挂载 Three.js**,避免渲染不全。
9. 调试 UI(坐标 / FPS / 输入向量)出现在 PC 调试视图右上角,**生产构建不展示**(`import.meta.env.DEV` 守卫)。

### 3.2 亚瑟技能模组(MVP 内必须实现的"机制")

亚瑟 4 个技能在王者的真实效果是有具体数值的,这一版不需要精调数值,但**机制分布必须覆盖**技能框架的全部用例,以验证后续元歌/镜能复用同一套框架。

| 技能 | 名称(工作版) | 关键机制 | 框架覆盖目标 |
|---|---|---|---|
| 被动 | **圣光守护** | 收到伤害有概率回血 + 脱战后加速 | **被动 / 概率触发 / 持续 buff** |
| 一技能 | **契约之盾** | 加移速 + 强化下次普攻(非指向位移/强化) | **位移 / 强化普攻 / 持续状态** |
| 二技能 | **回旋打击** | 原地转一圈对周围造成伤害 | **范围技能 / 多段伤害 / 自身判定** |
| 三技能 | **圣剑裁决** | 跳向目标造成伤害 + 落地判定 | **远距离突进 / 目标选取 / 后摇落地** |

> 这一组选得故意:有"位移、有概率、有范围、有锁定目标",框架跑通后,**元歌/镜的位移双单位 / 镜像 / 换位都能在这个框架里加新 case,不必改框架**。

### 3.3 模块拆分(5 个独立模块 + 1 个适配层)

| 模块 | 关键产出 | 验收 | 估时 |
|---|---|---|---|
| **A. 引擎底座** | Vite + TS + Three.js 启动;PerspectiveCamera + 固定角度跟随玩家(俯角 ~45°) + 双指缩放改 FOV + 固定步长 | 浏览器(桌面)看到彩色场景;手机也能跑(同 WiFi 部署);三棱锥在场景里能看到 3 面投影差异 | 0.5d |
| **B. 地形 + Entity 视觉层** | **B1(0.5d)** 程序生成色块地形主路 + 出生点 + 木人桩位 + 边界;**B2(0.5d)** 离线 Canvas2D 像素瓦片贴图,平滑替换 —— B2 只升级视觉,不阻塞后续模块 | 视觉上看到 §3.5 的三棱锥 + 光圈 + 箭头在场;B1 阶段能看到地形,B2 阶段看到像素地形 | 1d |
| **C. 摇杆输入** | Pointer Events → 归一化 → 与相机方向解耦的方向向量;单测覆盖 8 方位 | 桌面调试能用鼠标代摇杆,手机上能用手指拖;**静止值稳定,不能漂** | 1d |
| **D. 技能框架** | Skill 类型 + 命中盒(AABB/Circle/扇形/锁定目标)+ 伤害公式 + 后摇 + CD + 飘字 | 4 类机制(被动/位移/范围/锁定目标)各写一个用 Skill 框架的简单技能能跑 | 2.5d |
| **E. 亚瑟技能模组** | 1 被动 + 3 主动,基于 D 框架实现 | 在桩上能放完 4 个技能,反馈清晰 | 1d |
| **F. HUD + 重置** | 摇杆组件、技能按钮(含 CD 转圈)、血条、飘字、重置按钮 | 手机上完整跑一遍 §3.1 8 条 DoD | 1.5d |
| **G. 锁横屏 + 移动端适配** | `isMobileUA` + 三状态机(home/transitioning/play);`screen.orientation.lock` + iOS safe-area + 阻止双指缩放/下拉刷新;**调试 UI** | iOS + Android 各跑一次;刷新竖屏游戏页能自动转回;**桌面跳过 home 直接进 play** | 1d |
| **H. 自测 + 修 bug** | 跑 5 遍完整流程(包含横屏/竖屏切换、断网切重连、刷新),记录卡点 | DoD 全过,无 console error | 1d |

**总计约 9 工日(MVP)**。

### 3.4 明确不进入 MVP
- 元歌、镜(都是 P2)
- 录像回放
- 木人桩 AI(就是不动)
- 第二个地图
- 英雄选择界面(MVP 直接是亚瑟)
- 移动端 60fps 优化(目标 ≥30 已够,M7 阶段再优化)

### 3.5 Entity 视觉表达(MVP 锁定:三棱锥 + 光圈 + 箭头)

> **Entity 在世界里就是"一个能说话的三棱锥 + 脚下光圈 + 身上伸出的箭头"。** 没有外部美术资源,完全程序生成;风格统一靠 §3.6 的全局光源投影表达。

#### 3.5.1 三棱锥本体
- 几何:`TetrahedronGeometry` 或 `CylinderGeometry(radius=radius, radiusTop=0, radius=radius, radialSegments=3)`,后者更便于让底半径严格可控。
- **关键比例**:height = **底部外包圆直径的 1.5 倍**,即 `height = 2 * radius * 1.5 = 3 * radius`。
  - 默认参数:`radius = 0.4`,`height = 1.2`(比例恒定,后续调大小只动 radius,height 跟着)。
  - 含义:锥尖显著高于底半径,方向感强;3 个侧面的"上小下大"梯度让光照投影在旋转时变化更大。
- 朝向:**vertex 1(顶点)对应实体正方向(前)**。
- 旋转:摇杆向量直接驱动实体绕 Y 轴旋转,摇杆 0 向量时角度冻结在最后方向(Moba 默认)。

#### 3.5.2 脚下光圈
- 几何:`RingGeometry` 或 `Mesh(RingGeometry)`,贴地(`y=0.01`)避免 Z-fighting。
- **构成**:
  - 内圈:实色 + emissive(光圈"发光")
  - 外圈:同色半透(sprite-like),边缘 fade
- 默认参数:`innerRadius = 0.45`,`outerRadius = 0.55`,半透外圈 alpha `0.45`,emissive 强度 `0.6`。
- 视野辨识 > 视觉精致 —— 玩家在手机缩到 30 帧/秒、屏幕 720p 下也要看得清阵营。

#### 3.5.3 朝向箭头
- 几何:**柱身(`CylinderGeometry(radius=0.08, radius=0.08, length=1.0, radialSegments=8)`) + 圆锥头(`ConeGeometry(radius=0.18, height=0.3, radialSegments=8)`)**。
- 锚点:从三棱锥**底面中心**伸出,沿三棱锥正方向延伸到 `length = 1.0`。
- 默认参数:柱身 1.0 + 圆锥头 0.3,**总长 1.3**;箭头比三棱锥高 0.1(顶端凸出),提示方向更清晰。
- 父子关系:`arrow` 作为 `entity` 子节点,旋转继承自三棱锥;Entity 转,箭头同步转。

### 3.6 阵营与光照语言(实现要点,MVP 不可妥协)

**问题**:三棱锥 3 个侧面如果用 vertex-color 染色,得用 BufferGeometry 自定义 attribute,开发成本上升;**MVP 用更简单的方案**:

#### 3.6.1 三面同色 + 单一 DirectionalLight
- 三棱锥的 3 个侧面用**同一个材质**(`MeshStandardMaterial`),不染色。
- **场景里只有一个 DirectionalLight**,固定位置 `(5, 8, -3)`,颜色 `#ffffff`,intensity `1.0`。
- 这一束光在不同旋转角度会让三棱锥的 3 个侧面亮 / 中 / 暗,**玩家通过"最亮那一面顶点"的方位判断朝向**。
- 当 DirectionalLight 配合 mapSize=1024 的 PCFSoftShadowMap,锥子也拖一根细影,**进一步强化方向感**。

#### 3.6.2 必须的环境光兜底
- `AmbientLight` 强度 `0.3`,确保最暗的面不至于变黑,3 面梯度仍清晰但有底色。

#### 3.6.3 相机姿态(Moba 标配:**固定角度 + 跟随玩家移动**)

- **类型**:**PerspectiveCamera**,FOV 默认 `60`(双指缩放 FOV 40–80)。
- **姿态锁定**:**pitch ≈ 45° 俯角**(不与地图垂直,也不是 Top-down),yaw 朝 -Z 锁死(玩家默认朝相机的反方向)。up = +Y 不滚转。
- **跟随**:**相机锚点跟随玩家位置**(玩家移动 → 相机平移跟随);**相机姿态相对世界不旋转**。这是 LoL/王者 PvP 的标准形态,不是 Free Orbit,玩家不能转 yaw。
- **边界软拉**:玩家移动到地图边缘时,**相机沿 '与边界垂直方向' 推回 1–2 个单位**,确保玩家被墙挡住时仍能看到前方(避免"撞墙"看不到前方)。
- **正交/透视决策**:MVP 锁定透视(王者/LoL 风);若实施时发现透视对像素感太"软",**只改 1 行可切回 OrthographicCamera**(`renderer.ts` 留 `createCamera()` 抽象)。

**位置 / 朝向参数化**:
```
// 设 player.position = (px, 0, pz), 俯角 theta
// 相机位 = (px + 0,   py + dist*sin(theta),  pz - dist*cos(theta))
//         (player 平移 + 沿 yaw 方向后退 dist)
// camera.lookAt(player.position + (0, 0.5, 0))
```
- 默认 `dist = 16`,`theta = 45°`(约 `sin=cos=0.707`)→ 相机相对玩家高 `16 * 0.707 ≈ 11.3`,远 `-11.3`(按玩家朝 -Z 计算)。
- **关键校验**:相机位 (px, py+11.3, pz-11.3),LookAt(px, 0.5, pz)+ 3 面投影梯度要清晰。

#### 3.6.4 地图与障碍(已锁定:Arena + 柔化多边形障碍 + 硬墙)

> 玩家口语 → 术语对照:
> - **"地图是一个平面"** → **Arena(竞技场)**:一个有限大小的长方形平面(Play Space),有 Hard Wall 包围。
> - **"上面有一些边缘连续不尖锐的箱式障碍"** → **柔化多边形障碍**:几何是长方体,**边缘倒角**(圆角 Box / RoundedBoxGeometry),"不尖锐" = 玩家碰到不是尖角撞回,而是平滑滑动。
> - **"硬墙"** → **Hard Wall**:出界物理阻挡,撞上 0 速度分量,**不软拉地形**。
> - **"玩家不能跳"** → **Ground-Only Displacement**:Y 轴速度恒为 0;所有位移 = ground plane 滑行/突进,**不允许 y±**。

| 项 | 决策 | 备注 |
|---|---|---|
| 地图形状 | **矩形 Arena**(长方形,边长可调,默认 32 × 32)| 不是 LoL/王者那种"主路弯曲"3 路分路;MVP 是练习场,单 Play Space |
| 障碍几何 | **RoundedBoxGeometry**,圆角 `radius = 0.3` | 用 `three/examples/jsm/geometries/RoundedBoxGeometry`,不要直接 Box |
| 障碍边缘硬度 | **硬墙**(Hard Wall)碰撞,无 Y 抬升 | 玩家可绕、可侧面接触;但**斜撞会自动沿墙面滑动** |
| 玩家 Y 锁定 | `position.y` 恒为 `0.6`(三棱锥浮起一点,避免贴地)| 不能跳;技能位移 = 平面滑动/突进,**不允许 y±** |
| 边界处理 | Hard Wall + **相机软拉**(`pushInBoundary(camera, px, pz, dist=11.3)`)防止撞墙看不见前方 | 与 §3.6.3 边界软拉联动 |
| 障碍装饰 | 贴图分两态:`#0e1525` 暗 + `#3a4a6b` 亮 vColor(像素风)| §3.6.6 同色思路在此也走染 Map(不 vertex color)|

#### 3.6.5 阵营颜色表(同色 → 不同 baseColor)
| Entity | 三棱锥 baseColor | 光圈 baseColor | 箭头 baseColor |
|---|---|---|---|
| 玩家(亚瑟) | `#3b78ff` 蓝 | `#3b78ff` | `#ffd84a` 金 |
| 木人桩 | `#1fa4a8` 青 | `#ff5151` 红 | `#ff5151` 红(被打闪烁) |
| 敌方(预留) | `#a34ee0` 紫 | `#ff8a2a` 橙 | `#ff8a2a` |

> 木人桩三棱锥 = 青,但**光圈是红**,**这个错位**(同色暗示同阵营、不同光圈暗示不同阵营)是故意的:亚瑟/木人桩在视觉上明显不同,但又都属于"玩家这一侧"(都吃蓝队友 buff 这种 P2 时的设计)。

#### 3.6.6 被打反馈
- 木人桩被命中瞬间:`baseColor × 1.4 + emissive × 1` 持续 80ms,然后插值回原值。
- 飘字另外用 Three.js Sprite(不走 React,见 §5.4 commit 守则)。

### 3.7 Entity 视觉层接口草案(对齐用,不实施)

```ts
// src/engine/renderer/entity-visuals.ts
export interface EntityVisualConfig {
  radius: number;         // 三棱锥底半径,默认 0.4
  ringInner: number;      // 光圈内圈,默认 0.45
  ringOuter: number;      // 光圈外圈,默认 0.55
  arrowLength: number;    // 箭头总长,默认 1.3
  coneColor: string;      // 三棱锥
  ringColor: string;      // 光圈
  arrowColor: string;     // 箭头
}

export const DEFAULT_VISUAL: EntityVisualConfig = {
  radius: 0.4,
  ringInner: 0.45,
  ringOuter: 0.55,
  arrowLength: 1.3,
};

export interface EntityVisualHandle {
  root: THREE.Group;       // 整组(锥+圈+箭头),可作为单位 node 的 child
  setFacingRad(r: number): void;
  setRingPulse(t: number): void;   // 被打闪烁
  dispose(): void;
}

export function createEntityVisual(cfg: Partial<EntityVisualConfig>): EntityVisualHandle {
  // ...实现后续开工时填
}
```

**为什么先定型**:亚瑟 → 元歌 → 镜,每个英雄都有自己的 Entity Visual(傀儡、镜像轴、本体),**共用同一份接口**,新增英雄不应改渲染层。

---

## 4. 里程碑

| 里程碑 | 周次 | 交付物 | 退出准则 |
|---|---|---|---|
| **M0 引擎可见 + 横屏骨架** | W1 Day 1 | A + G 的三状态机骨架 | 桌面直接进 play;手机 home 可见"开始游戏"按钮,点击后进 play |
| **M1 地图与摇杆** | W1 Day 2-3 | B + C | 玩家在像素地图上跟摇杆走 |
| **M2 技能框架** | W1 Day 4-5 + W2 Day 1 | D | 4 类简单技能都能飞(纯调试用,非亚瑟) |
| **M3 亚瑟成型** | W2 Day 2 | E + F 上半 | 亚瑟在桩上能完整放 1/2/3 + 被动可见 |
| **M4 MVP 验收** | W2 Day 3-5 | F + G + H | §3.1 DoD 8 条全过,双端跑通 |
| **M5 元歌扩展** | 见 §6 | 元歌技能模组 | 元歌 4 技能 + 傀儡 + 收回在桩上可练 |
| **M6 镜扩展** | 见 §6 | 镜技能模组 | 镜换位 + 飞雷神基本流程 |
| **M7+ 优化** | 视情况 | 帧率/发热/720p 分辨率 | 移动端稳定 ≥30 fps |

> 单人有 React + Three.js 经验估;首接触放大 1.5–2×。

---

## 5. 关键技术细节(实施时必看)

### 5.1 摇杆实现要点
- `touch-action: none` 在摇杆 DOM 容器上,否则移动浏览器会拦截手势冲突。
- 摇杆"中点"是玩家朝向(因为目前 MVP 没锁定目标),不需要额外的"指向"按钮。
- 摇杆值在 Pointer Cancel(`pointercancel`)下要归零,不能卡在漂移。
- 写单测:8 方位 + 静止 + 越界值 → 应当换算成方向向量。

### 5.2 技能框架的"形状"
这是 MVP 内最重要的一个抽象。要支持后续元歌/镜,**接口必须足够薄**。建议形状:

```ts
interface Skill {
  id: string;
  cooldown: number;
  range: 'self' | 'circle' | 'rect' | 'cone' | 'target';     // 命中盒
  displacement?: 'ground' | 'dash';  // 位移方式(默认 'ground'): ground=沿平面滑动(允许斜撞自动沿障碍滑),dash=一次性突进(可穿过小掩体,但是和 ground 同样不允许 y±)
  castTime: number;          // 前摇(秒)
  recovery: number;          // 后摇
  damage?: DamageFormula;
  onCast(ctx: SkillContext): SkillInstance; // 返回一个带 update/tick 的对象
}

interface SkillInstance {
  tick(dt: number, world: WorldState): void;  // 推进前摇/生效/后摇阶段
  isDone(): boolean;
}
```

**重要约定**(随 §3.6.4 锁定):
- `position.y` 在世界状态下恒为 `0.6`,**任何 dt 都不能写 y±**。SkillInstance.tick 内部写 y 会崩。
- `displacement = 'ground'`(地面滑行)会自动调用 Arena 的"墙面"碰撞:`pushOutOfBounds(pos, arenaSize)`。撞墙减速到 0,不透墙。
- `displacement = 'dash'` 一次性突进,也接受 Hard Wall 阻挡(同样不能透过墙)。
- 后续 P2 元歌 / 镜即使需要"复杂位移"(双单位 / 换位),也必须落到 `ground` 或 `dash` 两种,不增设跳跃。

理由:
- 元歌的"30 多 23 连"、镜的"换位瞬间"都需要**易取消 / 可接下一个技能**,所以 SkillInstance 应该是可中断的。
- 命中盒选 `self/circle/rect/cone/target` 五类是覆盖王者所有英雄技能类型的最小集合。

### 5.3 重置的"逻辑纯净"
重置不是 UI 按钮的 onClick,而是游戏循环里一个 `ResetSignal`。原因:
- 重置可能在中途(比如玩家按 1 技能正在前摇时被重置),逻辑层要能清理前摇实例。
- 重置可能由键盘(MVP 桌面端调试)或按钮(手机)触发,二者应该汇聚到同一个信号。

### 5.4 不做的东西要写进 commit 守则
- 不能在亚瑟阶段动 `engine/` 的核心接口(否则元歌/镜上线时会被迫改引擎)。
- 木人桩不要偷偷加 AI(永远静止,takes damage only)。
- HUD 用 React,**伤害飘字不要走 React**,直走 Three.js Sprite(高频更新会踩 reconciler)。

### 5.5 锁横屏全屏的实施要点

1. **`isMobileUA()`** 用宽口径判断:`navigator.userAgent` 命中 `Mobi|Android|iPhone|iPad`,iPadOS 13+ 桌面 UA 用 `touchEvent` 兜底。
2. **`screen.orientation.lock('landscape')` 必须包 try/catch**:iOS PWA 内可能抛 NotSupportedError,降级为 CSS(顶部黑边占位)。失败仅 warning。
3. **iOS 启动期双阶段**:用户从 home 点"开始游戏"是**首次用户互动**,所以 `lock()` 必须在 click handler 里同步触发,不可延后到下个 tick。
4. **游戏页挂载序**:`orientation/matchMedia` → 不通过 → 渲染"请旋转设备"全屏遮罩(纯 DOM,React 即可) → 通过 → 挂载 `<GameCanvas>`(内部创建 Three.js Renderer)。
5. **iOS safe-area**:`viewport-fit=cover` + `env(safe-area-inset-*)` 适配刘海/灵动岛;摇杆底边贴 safe-area 而不是屏幕底边。
6. **`requestFullscreen()` 同样必须在 click handler 里同步触发**,失败不报红(MVP 不强求真全屏,CSS 横屏即可)。
7. **调试 UI**:`/src/ui/components/DebugOverlay.tsx`,只在 `import.meta.env.DEV` 下渲染,展示 FPS、玩家坐标、摇杆向量、当前技能阶段;生产构建 tree-shake 掉。



---

## 6. 后续路线(先不启动,留口子)

| 序号 | 内容 | 与底座关系 | 估时级别 |
|---|---|---|---|
| P2.1 | **元歌技能模组** | 复用车把/伤害公式;新加"双单位(本体+傀儡)"和"收回"机制 | 4d |
| P2.2 | **镜技能模组** | 复用位移/换位机制;新加"镜像轴"与"双形态" | 3d |
| P2.3 | **第二个木人桩 + 假人位编辑器** | 复用单位基类;UI 加一个拖拽编辑器 | 1.5d |
| P2.4 | **录像回放**(若用户需要) | 重构 `WorldState` 序列化层 + 时间轴 scrubbing | 3d |
| P2.5 | **远程发布**(内网部署) | dev server 暴露在局域网,手机扫码访问 | 0.5d |
| P2.6 | **像素美术升级** | 替换程序生成瓦片为手绘 tileset;`TextureSource` 接口抽象已留好 | 2d |
| P2.7 | **移动端 60fps 优化** | 降瓦片数 / 降 post-processing / 关闭 MSAA | 1.5d |

> P2.1 元歌优先级最高,但**先做 P2.5** 才能让你在手机上实测,否则只能在 dev 阶段看不到效果。这是一个**"打磨底座 → 在手机上自测"的反馈环**。

---

## 7. 已落定的决策(本轮对齐)

| # | 决策点 | 选择 | 落定位置 |
|---|---|---|---|
| 1 | 亚瑟技能数值 | **合理默认值**,不强行匹配王者荣耀原版 | §3.2 + 一个 `heroes/arthur.json`(可调) |
| 2 | 锁横屏 + 全屏 | **强制**:移动 UA 走 home → 点击"开始游戏"→ lock landscape + 全屏 → 再进 play;**桌面不展示 home 直接 play**;游戏页刷新竖屏先转屏再渲染 Three.js | §1.5 + §5.5 |
| 3 | 调试 UI | **可以有**:`/src/ui/components/DebugOverlay.tsx`,`import.meta.env.DEV` 守卫,生产构建 tree-shake | §5.5 第 7 条 + §3.1 DoD #9 |

> §7 没有再待回答的问题。下一轮需要确认的是"开始 M0 开工吗",还是先把亚瑟 4 技能的数据先写一遍。

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| iOS Safari 不让自动全屏 / 域名访问校验 | 移动端跑不通 | 不依赖 fullscreen API;用 viewport meta + safe area;MVP 内不申请 fullscreen |
| 双指缩放与浏览器原生气势冲突 | 玩家缩不动相机 | 在画布上 `touch-action: none`,自己接 `pointer` 事件 |
| 摇杆值漂移(pointercancel 不归零) | 角色持续移动 | 写单测 + 监听 `pointercancel/leave/visibilitychange` 强制归零 |
| 技能接口太薄,加元歌时被迫扩 API | 重构 | §5.2 的 5 类命中盒 + SkillInstance 可中断,目标是覆盖元歌的"23 连"和镜的"飞雷神" |
| 像素画在 iOS 默认字体 / DPR 下糊 | 视觉违和 | `texture.magFilter = NearestFilter` + `image-rendering: pixelated` + 渲染分辨率按 DPR 整数缩放 |
| 玩家按技能时帧率掉到 25 fps | 手感不可用 | 飘字走 Sprite 不走 React;瓦片批量 draw call;**性能预算在 M1 落定**(≤2000 draw call / 帧) |

---

## 9. 一句话总结

**移动端优先(强制锁横屏+全屏,首页"开始游戏"按钮)、纯前端、亚瑟一根木人桩的离线手法练习场。9 工日完成 MVP;后续元歌、镜、第二个桩、录像回放都建立在同一个"渲染/逻辑分离 + 数据驱动 + 技能框架 5 类命中盒"底座上,亚瑟阶段守住的每一条架构原则都是后续扩展的杠杆。**
