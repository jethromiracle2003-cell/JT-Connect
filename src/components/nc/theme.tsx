import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { cn } from "@/lib/cn";

export type ThemeName = "dark" | "light";

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function storedTheme(): ThemeName {
  try {
    return localStorage.getItem("nc-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("dark");

  useEffect(() => {
    setThemeState(storedTheme());
  }, []);

  const setTheme = (next: ThemeName) => {
    setThemeState(next);
    try {
      localStorage.setItem("nc-theme", next);
    } catch {
      /* ignore private mode */
    }
  };

  useEffect(() => {
    document.body.classList.toggle("light", theme === "light");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className={cn("h-dvh overflow-hidden bg-bg text-fg", theme === "light" && "light")}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("Theme missing");
  return value;
}

export function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="top-center" />;
}
