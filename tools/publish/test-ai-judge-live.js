/**
 * 真实调用一次：验证密钥/接口/模型可用，并看判定是否合理。
 * 只发两段代码（完整脚本 + 片段），费用可忽略；结果会写进缓存。
 */
const { judgeCodes } = require('E:\\DeepSeekHarness\\desktop\\src\\ai-judge.js');

const HOME = 'E:\\DeepSeekHarness\\home';

const FULL = `import pandas as pd
import matplotlib.pyplot as plt

customers = pd.read_csv("customers.csv")
orders = pd.read_csv("orders.csv")
merged = orders.merge(customers, on="customer_id", how="left")
monthly = merged.groupby(merged["created_at"].str[:7])["amount"].sum()

fig, ax = plt.subplots(figsize=(8, 4))
monthly.plot(kind="bar", ax=ax)
ax.set_title("Monthly revenue")
fig.tight_layout()
fig.savefig("monthly.png", dpi=200)
print("saved monthly.png", len(monthly), "months")
`;

const FRAG = `df = df.dropna()
df["date"] = pd.to_datetime(df["date"])
df.head()`;

(async () => {
  const result = await judgeCodes(
    HOME,
    [
      { id: 'full', lang: 'python', name: 'monthly_revenue.py', code: FULL },
      { id: 'frag', lang: 'python', name: 'snippet.py', code: FRAG },
    ],
    { maxCalls: 4 },
  );
  console.log('ok=' + result.ok + '  calls=' + result.calls + (result.error ? '  error=' + result.error : ''));
  for (const [id, v] of Object.entries(result.results)) {
    console.log(`  [${id}] usable=${v.usable}  功能=${v.feature}  理由=${v.reason}  ${v.cached ? '(缓存)' : '(新判定)'}`);
  }
})();
