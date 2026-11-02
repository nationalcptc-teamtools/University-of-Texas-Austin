import { Button, DropdownMenu } from "@cloudflare/kumo";
import { FunnelSimpleIcon } from "@phosphor-icons/react";

type Props = {
  owners: string[];
  userName: string;
  /** The owner whose findings are shown, or "" for everyone's. */
  value: string;
  onValueChange: (owner: string) => void;
};

/** What the findings list shows, as its heading. */
export const ownerLabel = (owner: string, userName: string) =>
  owner === "" ? "All findings" : owner === userName ? "Your findings" : `${owner}'s findings`;

/** Picks whose findings the sidebar lists: everyone's, yours, or another owner's. */
export function OwnerFilter({ owners, userName, value, onValueChange }: Props) {
  const others = owners.filter((owner) => owner !== userName);
  const options = ["", userName, ...others];
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            icon={value ? <FunnelSimpleIcon weight="fill" /> : FunnelSimpleIcon}
            aria-label="Filter by owner"
          />
        }
      />
      <DropdownMenu.Content className="max-h-96 w-64 overflow-y-auto">
        <DropdownMenu.RadioGroup value={value} onValueChange={onValueChange}>
          {options.map((owner) => (
            <DropdownMenu.RadioItem key={owner} value={owner} closeOnClick>
              <span className="min-w-0 flex-1 truncate">
                {owner === "" ? "Everyone" : owner === userName ? "You" : owner}
              </span>
              <DropdownMenu.RadioItemIndicator />
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
