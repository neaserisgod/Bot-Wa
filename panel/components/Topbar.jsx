export default function Topbar({ titulo, children }) {
  return (
    <div className="topbar">
      <h1>{titulo}</h1>
      <div className="row">{children}</div>
    </div>
  );
}
