import { SetupWizard } from "@/components/setup/SetupWizard";
export default function SetupPage() {
  return (
    <div className="space-y-6">
      <div><div className="label">Set up</div><h1 className="text-2xl font-semibold tracking-tight">Create your vault</h1></div>
      <SetupWizard />
    </div>
  );
}
