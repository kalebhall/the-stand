"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Avoid hydration mismatch by waiting for mount
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex gap-2 opacity-0">
        <Button variant="outline" size="sm">Light</Button>
        <Button variant="outline" size="sm">Dark</Button>
        <Button variant="outline" size="sm">System</Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button 
        variant={theme === 'light' ? 'default' : 'outline'} 
        size="sm" 
        onClick={() => setTheme("light")}
      >
        Light
      </Button>
      <Button 
        variant={theme === 'dark' ? 'default' : 'outline'} 
        size="sm" 
        onClick={() => setTheme("dark")}
      >
        Dark
      </Button>
      <Button 
        variant={theme === 'system' ? 'default' : 'outline'} 
        size="sm" 
        onClick={() => setTheme("system")}
      >
        System
      </Button>
    </div>
  );
}