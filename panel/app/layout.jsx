import './globals.css';

export const metadata = {
  title: 'Panel Nefertiti',
  description: 'Gestión y ventas del almacén Nefertiti',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
