import { requerirUsuario } from '../../../lib/guard.js';
import Topbar from '../../../components/Topbar.jsx';
import EmpleadosManager from './EmpleadosManager.jsx';
import { listarEmpleados } from '../../../lib/repo.js';

export const dynamic = 'force-dynamic';

export default function EmpleadosPage() {
  const usuario = requerirUsuario('empleados');
  const empleados = listarEmpleados();
  return (
    <>
      <Topbar titulo="Empleados" />
      <div className="content">
        <EmpleadosManager inicial={empleados} miId={usuario.id} />
      </div>
    </>
  );
}
