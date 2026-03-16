# WeekPlanner

一个基于 React + TypeScript + Electron 的周计划工具，支持项目化管理待办、任务关系追踪和 Markdown 文件同步。

## 当前功能

- 周视图（Mon-Fri）按项目管理任务，支持快速新增、重命名、删除。
- 项目管理：新增、改名、改色、拖拽排序、归档/恢复、删除。
- 任务管理：勾选完成、设为待定、拖拽跨天/跨项目移动、右键菜单操作。
- 子任务：新增、编辑、删除，子任务完成状态会自动汇总到主任务。
- 任务关系：可从任务派生后续任务（`↳`），也可手动关联前序任务。
- 关系图视图：查看任务上下游关系链路。
- 月视图：按周展示整月任务概览，点击日期可跳转回周视图。
- 统计信息：展示每日完成率、项目完成率、当周总完成率。
- 历史未完成任务会在后续日期以“延续任务”形式展示（非待定任务）。
- 主题切换：深色/浅色模式。
- 数据能力：
  - 自动本地保存（`localStorage`）。
  - 导入/导出 Markdown。
  - 绑定本地 Markdown 文件并自动回写同步。
- 桌面增强（Electron）：
  - 全局快捷键 `CommandOrControl + Shift + Space` 呼出 Quick Add。
  - Quick Add 一键写入 `📥Inbox` 项目（当天列）。
  - 系统打开/保存文件对话框。

## 技术栈

- 前端：React 18 + TypeScript + CRA (`react-scripts`)
- 桌面：Electron 35 + electron-builder
- 可选原生壳（仅 macOS）：Swift + WKWebView（目录 `macos-native/`）

## 安装与运行

### 1. 克隆

```bash
git clone https://github.com/fanchl/WeekPlanner.git
cd WeekPlanner
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动方式

#### 方式 A：Web 开发模式（浏览器）

```bash
npm start
```

- 默认启动本地开发服务器（通常是 `http://localhost:3000`）。
- 适合日常前端开发与调试。

#### 方式 B：桌面模式（Electron）

```bash
npm run desktop
```

- 会先执行前端构建，再启动 Electron。
- 可使用全局快捷键呼出 Quick Add。

### 4. 构建发布包

```bash
npm run dist:desktop
```

- 该命令会生成未安装版桌面产物（directory target）。
- 输出目录通常在 `dist/`（如 macOS 下会有 `dist/mac/WeekPlanner.app`）。

## 可选：macOS 原生壳运行与打包

> 仅在 macOS 且已安装 Xcode Command Line Tools / Swift 工具链时使用。

### 本地运行

```bash
npm run build
cd macos-native
swift run
```

### 打包 `.app`

```bash
cd macos-native
./package-app.sh
```

- 产物路径：`macos-native/dist/WeekPlanner.app`

## 目录说明

- `src/`: React 前端逻辑与样式
- `electron/`: Electron 主进程、preload、Quick Add 窗口
- `macos-native/`: Swift 原生 macOS 宿主
- `public/`: 前端静态模板

## 常用命令

```bash
npm start          # Web 开发模式
npm run build      # 前端生产构建
npm run desktop    # 构建后启动 Electron
npm run dist:desktop  # 生成桌面分发产物
```
