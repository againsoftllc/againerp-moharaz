export function WebsitePlaceholderPage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-start justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-6 py-12">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {description ?? `${title} — coming soon.`}
      </p>
    </div>
  );
}
