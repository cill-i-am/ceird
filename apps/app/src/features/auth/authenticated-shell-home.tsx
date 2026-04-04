import { Badge } from "#/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "#/components/ui/card";

export function AuthenticatedShellHome() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 px-4 py-10 sm:py-14">
      <Card className="w-full">
        <CardHeader className="gap-4">
          <Badge variant="secondary" className="w-fit">
            Signed in
          </Badge>
          <div className="space-y-2">
            <h1 className="font-heading text-3xl font-medium tracking-tight sm:text-4xl">
              Your work
            </h1>
            <CardDescription className="max-w-2xl text-base">
              This workspace is ready for your tasks, progress, and project
              notes.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="m-0 max-w-2xl text-sm text-muted-foreground">
            Use the authenticated shell to stay focused on the work itself.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
