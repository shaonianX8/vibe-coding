export const dynamic = "force-static";

export default function Offline() {
  return (
    <main>
      <h1>网络中断</h1>
      <div className="card">
        <p>现在连不上服务器。已经填写但没提交的内容保存在这台手机上，联网后回到原页面会自动恢复。</p>
        <p className="muted">恢复网络后，下拉刷新或重新打开应用即可。</p>
      </div>
    </main>
  );
}
