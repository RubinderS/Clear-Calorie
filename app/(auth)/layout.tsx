export default function AuthLayout({children}: {children: React.ReactNode}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-4">
      <div className="mb-6 flex items-center gap-2 text-xl font-bold tracking-tight">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm">
          C
        </span>
        ClearCalorie
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
