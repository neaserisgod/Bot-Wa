import { redirect } from 'next/navigation';
import { getUsuario, modulosDe } from '../../lib/auth.js';
import Sidebar from '../../components/Sidebar.jsx';

export default function PanelLayout({ children }) {
  const usuario = getUsuario();
  if (!usuario) redirect('/login');

  return (
    <div className="app">
      <Sidebar modulos={modulosDe(usuario.rol)} usuario={usuario} />
      <div className="main">{children}</div>
    </div>
  );
}
