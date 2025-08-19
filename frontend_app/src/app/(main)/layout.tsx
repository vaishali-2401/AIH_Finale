export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout's only job is to render the page component.
  // Our page.tsx now handles the main content and sidebar structure.
  return <>{children}</>;
}