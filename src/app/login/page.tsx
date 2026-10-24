import PantallaLogin from "@/components/PantallaLogin";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <PantallaLogin error={error} desde="/login" />;
}
