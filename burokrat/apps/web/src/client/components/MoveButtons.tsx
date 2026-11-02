import { Button } from "@cloudflare/kumo";
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "@phosphor-icons/react";

type Props<T> = {
  index: number;
  count: number;
  label: string;
  /** Writes to the list the item is in. */
  update: (write: (list: T[]) => void) => void;
};

function move<T>(list: T[], from: number, to: number) {
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item!);
}

/** Move up, move down and delete for one item of a list. */
export function MoveButtons<T>({ index, count, label, update }: Props<T>) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="ghost"
        size="sm"
        shape="square"
        icon={ArrowUpIcon}
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => update((list) => move(list, index, index - 1))}
      />
      <Button
        variant="ghost"
        size="sm"
        shape="square"
        icon={ArrowDownIcon}
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => update((list) => move(list, index, index + 1))}
      />
      <Button
        variant="ghost"
        size="sm"
        shape="square"
        icon={TrashIcon}
        aria-label={`Delete ${label}`}
        onClick={() => update((list) => void list.splice(index, 1))}
      />
    </div>
  );
}
