> **范围：P2。** 排期与开工条件见 [`docs/DEV.md`](./docs/DEV.md) —— **M4 退出门之前不实施本文件**。

## 任务：生成 MOBA 地图系统

### 输入
读取 map.yaml，包含：
- size: 地图尺寸
- lanes: 三条路的路径坐标
- towers: 防御塔位置和阵营
- camps: 野怪营地
- obstacles: 障碍物列表（wall/bush/water）

### 输出要求

1. **TerrainRenderer** — 地面渲染
   - 读取 obstacles，按类型渲染不同地形
   - 草地用平面 + 程序化像素贴图
   - 河道用带流动动画的半透明平面
   - 墙体用 BoxGeometry，高度 2

2. **Minimap** — 小地图
   - 200x200 Canvas，渲染在右下角
   - 蓝色=蓝方，红色=红方
   - 绿色=草丛，灰色=墙，蓝色=水

3. **NavigationGrid** — 寻路网格
   - 根据 obstacles 生成可通行/不可通行网格
   - A* 寻路，单位不能穿过 wall/water
   - bush 可通行但影响视野

4. **VisionSystem** — 视野系统
   - 单位视野半径 15
   - wall 和 bush 阻挡视野
   - 草丛外看不到草丛内的单位

### 坐标系
- 原点 (0,0) 在左下角
- x 向右，y 向上
- Three.js 中 y 是高度，用 z 作为地图的 y 轴


```
# map.yaml — 地图配置
map:
  size: { width: 100, height: 80 }  # 地图像素尺寸
  tile_size: 1                       # 每格1单位

  # 路径定义（坐标序列）
  lanes:
    top:    [[0,70], [20,70], [50,70], [80,70], [100,70]]
    mid:    [[0,40], [25,40], [50,40], [75,40], [100,40]]
    bottom: [[0,10], [20,10], [50,10], [80,10], [100,10]]
    jungle_top: [[30,55], [35,60], [40,55]]
    jungle_bot: [[30,25], [35,20], [40,25]]

  # 防御塔（位置 + 阵营 + 路线）
  towers:
    - { pos: [10, 70], team: blue, lane: top }
    - { pos: [30, 70], team: blue, lane: top }
    - { pos: [90, 70], team: red,  lane: top }
    - { pos: [70, 70], team: red,  lane: top }
    # ... 每条路 3 塔 + 基地

  # 野怪营地
  camps:
    - { pos: [25, 55], type: small, respawn: 60 }
    - { pos: [35, 30], type: small, respawn: 60 }
    - { pos: [50, 55], type: boss, respawn: 120 }  # 暴君
    - { pos: [50, 25], type: boss, respawn: 180 }  # 主宰

  # 障碍物（不可通行区域）
  obstacles:
    # 地图边界
    - { type: wall, rect: [0, 0, 100, 1] }
    - { type: wall, rect: [0, 79, 100, 80] }
    # 河道两岸
    - { type: terrain, rect: [0, 35, 30, 37] }   # 上侧河道岸
    - { type: terrain, rect: [0, 43, 30, 45] }   # 下侧河道岸
    # 野区墙体
    - { type: wall, rect: [20, 50, 22, 65] }     # 上野区分隔墙
    - { type: wall, rect: [20, 15, 22, 30] }     # 下野区分隔墙
    # 草丛（可通行但遮挡视野）
    - { type: bush, rect: [28, 52, 32, 56] }
    - { type: bush, rect: [28, 24, 32, 28] }
    - { type: bush, rect: [48, 38, 52, 42] }     # 河道草丛

```

二、对称设计降低实现难度
王者荣耀的地图是镜像对称的（蓝方视角和红方视角）：

蓝方基地                                    红方基地
  (0,0) ┌────────────────────────────────┐ (100,80)
        │  上路 ───────────────────────  │
        │                                │
        │  中路 ───────────────────────  │
        │                                │
        │  下路 ───────────────────────  │
        └────────────────────────────────┘
给 Agent 的关键指令：

## 地图对称规则

1. 地图以中心点 (50, 40) 为中心，红蓝双方完全镜像
2. 只需要定义蓝方的塔位/野区/障碍，红方自动生成：
   red_pos = (100 - blue_x, 80 - blue_y)
3. 河道沿对角线或中轴分割
4. 蓝方视角固定（摄像机不旋转），红方玩家看到的是同一张地图
只定义一半，另一半自动生成 —— 减少一半工作量。
三、障碍物的分类系统

```
obstacle_types:
  wall:
    passable: false      # 不可通行
    blocks_vision: true  # 阻挡视野
    color: 0x333333      # 深灰色

  bush:
    passable: true       # 可通行
    blocks_vision: true  # 隐藏其中的单位
    color: 0x2d5a1e      # 深绿色

  water:
    passable: false      # 不可通行（无位移技能时）
    blocks_vision: false
    color: 0x1a5276      # 深蓝色

  terrain_low:
    passable: true       # 可通行
    blocks_vision: false
    color: 0x6b8e23      # 浅绿色（地面装饰）

```

## 障碍物渲染规则

每种障碍类型有固定的 Three.js 渲染方式：
- wall → BoxGeometry，高度 2，颜色 #333333
- bush → PlaneGeometry，高度 0.1，颜色 #2d5a1e，半透明
- water → PlaneGeometry，颜色 #1a5276，带波纹 shader
- terrain_low → PlaneGeometry，颜色 #6b8e23

碰撞检测：只检查 passable=false 的类型
视野计算：只检查 blocks_vision=true 的类型

## 像素贴图生成规则

每种地形类型用 16x16 像素贴图，程序化生成：

### 草地 (grass)
- 基色: #4a7c3f
- 随机像素: #3d6b35 (深) 和 #5a8c4f (浅)，各占 15%
- 每 4 帧切换随机种子做动画闪烁

### 河道水面 (water)
- 基色: #1a5276
- 每帧偏移 UV 坐标模拟流动
- 波纹：正弦函数叠加 3 层不同频率

### 泥土路径 (dirt)
- 基色: #8b6914
- 随机噪点: #7a5c10 和 #9c7a20

### 石墙 (stone_wall)
- 基色: #555555
- 用 2x2 像素块做砖缝图案

## 不要做的事情

1. 不要用外部模型文件（.glb/.fbx）——全部用 Three.js 基础几何体 + 程序化贴图
2. 不要写死坐标——所有位置从 map.yaml 读取
3. 不要一次性渲染整个地图——只渲染摄像机视野范围内的瓦片（分块加载）
4. 不要给障碍物加物理引擎——简单的网格碰撞检测就够
5. 不要追求美术效果——先用纯色方块跑通逻辑，再加贴图

## 迭代策略和优先级

1. 地图可通行/不可通行（寻路）← 最重要
2. 防御塔位置正确
3. 野怪营地位置正确
4. 小地图显示正确
5. 贴图/视觉效果 ← 最后做


第一轮：纯色方块 + 网格
  → 验证：寻路对不对、塔位对不对、碰撞对不对

第二轮：程序化像素贴图
  → 验证：草地/水面/墙壁能区分

第三轮：视野系统 + 草丛
  → 验证：草丛内外视野隔离

第四轮：小地图 + HUD
  → 验证：全局态势感知
