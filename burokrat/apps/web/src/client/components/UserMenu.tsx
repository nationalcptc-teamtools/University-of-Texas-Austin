import { Button, DropdownMenu } from "@cloudflare/kumo";
import { DesktopIcon, MoonIcon, SignOutIcon, SunIcon, UserCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { logoutFn } from "../../auth.ts";
import { queryClient } from "../collections.ts";
import { forgetDevice } from "../offline-session.ts";
import { applyTheme, savedTheme, THEMES, type Theme } from "../theme.ts";
import { useOnline } from "../use-connection.ts";

const THEME_OPTIONS: Record<Theme, { label: string; icon: typeof SunIcon }> = {
  system: { label: "System", icon: DesktopIcon },
  light: { label: "Light", icon: SunIcon },
  dark: { label: "Dark", icon: MoonIcon },
};

export function UserMenu({ name }: { name: string }) {
  const [theme, setTheme] = useState(savedTheme);
  const online = useOnline();

  async function signOut() {
    await logoutFn();
    queryClient.clear();
    await forgetDevice();
    location.assign("/login");
  }

  function chooseTheme(next: Theme) {
    applyTheme(next);
    setTheme(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button variant="ghost" icon={UserCircleIcon}>
            {name}
          </Button>
        }
      />
      <DropdownMenu.Content>
        <DropdownMenu.RadioGroup value={theme} onValueChange={chooseTheme}>
          <DropdownMenu.Label>Theme</DropdownMenu.Label>
          {THEMES.map((option) => (
            <DropdownMenu.RadioItem
              key={option}
              value={option}
              icon={THEME_OPTIONS[option].icon}
              closeOnClick={false}
            >
              {THEME_OPTIONS[option].label}
              <DropdownMenu.RadioItemIndicator />
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
        <DropdownMenu.Separator />
        <DropdownMenu.Item icon={SignOutIcon} disabled={!online} onClick={() => void signOut()}>
          Sign out
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
