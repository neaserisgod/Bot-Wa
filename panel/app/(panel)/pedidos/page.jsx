import { requerirUsuario } from '../../../lib/guard.js';
import Topbar from '../../../components/Topbar.jsx';
import PedidosBoard from './PedidosBoard.jsx';
import { listarPedidosActivos } from '../../../lib/repo.js';

export const dynamic = 'force-dynamic';

export default function PedidosPage() {
  requerirUsuario('pedidos');
  const inicial = listarPedidosActivos();
  return (
    <>
      <Topbar titulo="Pedidos" />
      <div className="content">
        <PedidosBoard inicial={inicial} />
      </div>
    </>
  );
}
