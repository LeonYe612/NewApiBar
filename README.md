# NewApiBar

跨平台桌面小组件，专为 [New API](https://github.com/Calcium-Ion/new-api) 面板设计的实时用量监控浮窗。

支持 macOS / Windows / Linux。

![screenshot]()

## 功能

- **通用 New API 兼容** — 输入任意 New API 面板域名即可使用
- **余额 & 今日消耗** — 实时显示账户余额（¥）和当日 API 消耗金额
- **模型用量 Top 5** — 按今日消耗金额排序，带进度条可视化
- **深色 / 浅色主题** — 一键切换
- **毛玻璃透明效果** — 可调透明度（10%–60%），自适应主题背景
- **在所有桌面显示** — 置顶 + Mission Control 所有空间可见
- **窗口自由缩放** — 拖动边缘调整大小
- **系统托盘** — 隐藏/显示窗口、右键退出
- **自动刷新** — 可配置刷新间隔（1–60 分钟）

## 截图

*（待补充）*

## 下载

在 [Releases](https://github.com/YOUR_USER/NewApiBar/releases) 页面下载对应平台的安装包：

| 平台 | 格式 | 说明 |
|------|------|------|
| macOS | `.dmg` | 拖拽到 Applications 即可 ⚠️ 见下方说明 |
| Windows | `.exe` | NSIS 安装程序，可选安装目录 |
| Linux | `.AppImage` / `.deb` | 直接运行 AppImage 或用 dpkg 安装 deb |

### ⚠️ macOS 用户必读

本应用未经过 Apple 代码签名。首次打开时，macOS Gatekeeper 会阻止运行，显示「无法验证开发者」或「已损坏，无法打开」。

**这不是病毒，只是没付 $99/年给 Apple 买证书。** 解决方法（任选其一）：

**方法一：右键打开（推荐）**

在 Finder 中找到 `NewApiBar.app`，按住 `Control` 键点击 → 选择「打开」→ 在弹出的对话框中点击「打开」。

**方法二：终端移除隔离标记**

打开终端，执行以下命令：

```bash
# 如果从 .dmg 拖到了 /Applications
sudo xattr -cr /Applications/NewApiBar.app

# 如果放在其他位置，替换路径即可
sudo xattr -cr /path/to/NewApiBar.app
```

执行后即可正常双击打开。放心，`xattr -cr` 只会移除 Apple 的下载隔离标记，不损害文件。

## 从源码运行

### 前置要求

- Node.js 18+
- npm 或 yarn

### 安装

```bash
git clone https://github.com/YOUR_USER/NewApiBar.git
cd NewApiBar
npm install
```

### 启动

```bash
npm start
```

首次启动输入你的 New API 面板域名（如 `https://your-api-proxy.example.com`），然后输入用户名和密码登录。

## 构建安装包

```bash
# 安装依赖
npm install

# 生成图标（仅首次）
npm run gen-icon

# 按平台构建
npm run build:mac      # macOS .dmg
npm run build:win      # Windows .exe
npm run build:linux    # Linux .AppImage + .deb

# 或一次性构建所有平台
npm run build:all
```

构建产物在 `release/` 目录下。

> 构建时若 Apple 开发者证书不可用或已过期，electron-builder 会自动跳过签名。

## 使用

| 操作 | 方式 |
|------|------|
| 隐藏/显示窗口 | 点击窗口 − 按钮，或点击菜单栏托盘图标 |
| 手动刷新 | 点击 ↻ 按钮，或托盘菜单 → 刷新 |
| 设置 | 点击 ⚙ 按钮 |
| 退出 | 托盘右键 → 退出 |

### 设置

- **主题** — 深色 / 浅色
- **更新频率** — 1–60 分钟自动拉取数据
- **透明度** — 10%–60%，含毛玻璃模糊效果

## 技术栈

- [Electron](https://www.electronjs.org/) — 桌面框架
- [electron-builder](https://www.electron.build/) — 打包分发
- 原生 HTML / CSS / JS — 无前端框架依赖
- 直接 HTTP 请求，无需额外后端

## 项目结构

```
NewApiBar/
├── main.js          # Electron 主进程（窗口、托盘、IPC、API 调用）
├── preload.js       # 预加载脚本（安全暴露 IPC API）
├── renderer.html    # 渲染进程（UI + 逻辑）
├── build/
│   ├── icon.png     # 应用图标（512×512）
│   ├── icon.icns    # macOS 图标
│   └── gen_icon.py  # 图标生成脚本
├── package.json
├── start.sh         # 快捷启动脚本（开发用）
└── README.md
```

## License

MIT
