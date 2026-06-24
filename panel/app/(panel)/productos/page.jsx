import { requerirUsuario } from '../../../lib/guard.js';
import Topbar from '../../../components/Topbar.jsx';
import ProductosManager from './ProductosManager.jsx';
import { listarProductos } from '../../../lib/repo.js';

export const dynamic = 'force-dynamic';

export default function ProductosPage() {
  requerirUsuario('productos');
  const productos = listarProductos();
  return (
    <>
      <Topbar titulo="Productos" />
      <div className="content">
        <ProductosManager inicial={productos} />
      </div>
    </>
  );
}
