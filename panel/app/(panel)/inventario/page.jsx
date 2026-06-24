import { requerirUsuario } from '../../../lib/guard.js';
import Topbar from '../../../components/Topbar.jsx';
import InventarioManager from './InventarioManager.jsx';
import { listarProductos, listarMovimientos } from '../../../lib/repo.js';

export const dynamic = 'force-dynamic';

export default function InventarioPage() {
  requerirUsuario('inventario');
  const productos = listarProductos().filter((p) => p.activo);
  const movimientos = listarMovimientos({ limite: 50 });
  return (
    <>
      <Topbar titulo="Inventario" />
      <div className="content">
        <InventarioManager inicial={productos} movimientosIniciales={movimientos} />
      </div>
    </>
  );
}
