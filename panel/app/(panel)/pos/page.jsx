import { requerirUsuario } from '../../../lib/guard.js';
import Topbar from '../../../components/Topbar.jsx';
import PosTerminal from './PosTerminal.jsx';
import { listarProductos } from '../../../lib/repo.js';

export const dynamic = 'force-dynamic';

export default function PosPage() {
  requerirUsuario('pos');
  const productos = listarProductos({ soloActivos: true });
  return (
    <>
      <Topbar titulo="Punto de venta" />
      <div className="content">
        <PosTerminal productos={productos} />
      </div>
    </>
  );
}
