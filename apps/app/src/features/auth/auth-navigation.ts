import { useNavigate } from "@tanstack/react-router";

export function useAuthSuccessNavigation() {
  const navigate = useNavigate();

  return async () => {
    await navigate({ to: "/" });
  };
}
