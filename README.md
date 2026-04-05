# Pin Beads Tool

一个零依赖的纯前端小工具：上传照片后生成拼豆风预览图、图纸模式和颜色统计。

## 本地运行

直接打开 `index.html` 即可，或者：

```bash
cd /Users/lixiaoyao/pin-beads-tool
npm run dev
```

然后访问：

```text
http://localhost:4173/
```

## 当前功能

- 上传本地图片
- 调整细节密度
- 调整颜色数量
- 调整豆豆圆点占比
- 切换拼豆预览图 / 图纸模式 / 编号图纸
- 选择 2x / 3x / 4x 高清 PNG 导出
- 显示颜色统计

## 已完成的部署配置

项目已经补好了适合 Cloudflare Pages 的基础文件：

- `package.json`
- `wrangler.toml`
- `_headers`
- `.gitignore`

## 部署到 Cloudflare Pages

### 方法 1：网页面板部署

1. 把整个 `/Users/lixiaoyao/pin-beads-tool` 上传到 GitHub 仓库。
2. 登录 Cloudflare。
3. 进入 `Workers & Pages`。
4. 选择 `Create application`。
5. 选择 `Pages`。
6. 连接你的 GitHub 仓库。
7. 构建设置里填写：

```text
Framework preset: None
Build command: 留空
Build output directory: .
Root directory: 留空
```

8. 点击部署。

### 方法 2：命令行部署

先安装并登录 Wrangler：

```bash
npm install -g wrangler
wrangler login
```

然后在项目目录执行：

```bash
cd /Users/lixiaoyao/pin-beads-tool
npm run deploy
```

第一次部署时，如果 `pin-beads-tool` 这个项目名已被占用，可以把 `package.json` 和 `wrangler.toml` 里的项目名改掉再试。

## 后续可加

- 映射到真实拼豆品牌色卡
- 导出带编号的 PDF 图纸
- 每 16x16 自动分页
- 颜色替换和手动修格
