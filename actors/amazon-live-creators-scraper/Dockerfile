# 使用 Apify 官方基础镜像（包含 Node.js 和必要的依赖）
FROM apify/actor-node-playwright-chrome:20

# 安装依赖
COPY package*.json ./
RUN npm install --omit=optional

# 复制代码
COPY . .

# 启动 Actor
CMD ["npm", "start"]
