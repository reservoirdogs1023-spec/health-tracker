import type { RunMilestone } from '../../site/run-model';

function MilestoneList({ items }: { items: RunMilestone[] }) {
  return <ol className="run-milestones">{items.map(item => <li key={item.id} data-milestone-kind={item.kind}>
    <time dateTime={item.date}>{item.date}</time><strong>{item.label}</strong>
  </li>)}</ol>;
}

export function RunMilestones({ items }: { items: RunMilestone[] }) {
  return <article className="card run-milestone-card">
    <div className="card-heading"><h3>初めてできたこと</h3><p>初回到達と自己ベストの更新を、新しい順に。</p></div>
    {items.length === 0 ? <p className="run-note">記録が集まると表示されます。</p> : <>
      <MilestoneList items={items.slice(0, 8)} />
      {items.length > 8 && <details className="run-more"><summary>それ以前の出来事を表示（{items.length - 8}件）</summary><MilestoneList items={items.slice(8)} /></details>}
    </>}
    <p className="run-note">全期間の記録から表示しています。VO2maxの更新は、前の最高値から0.5以上上がった場合に表示します。</p>
  </article>;
}
