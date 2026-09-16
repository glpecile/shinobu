import { PickerSheet } from '@/components/picker-sheet';

/**
 * The role picker behind the filmography's role button: every department
 * the person holds under the current format, with its title count. One
 * control on the page instead of a strip of chips competing with the pill.
 */
export function RoleSheet({
  open,
  onClose,
  roles,
  value,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  roles: readonly { role: string; count: number }[];
  /** Null is every role. */
  value: string | null;
  onSelect: (role: string | null) => void;
}) {
  return (
    <PickerSheet onClose={onClose} onSelect={onSelect} open={open} title="Role" value={value}>
      <PickerSheet.Option
        count={roles.reduce((sum, entry) => sum + entry.count, 0)}
        label="All roles"
        value={null}
      />
      {roles.map((entry) => (
        <PickerSheet.Option
          count={entry.count}
          key={entry.role}
          label={entry.role}
          value={entry.role}
        />
      ))}
    </PickerSheet>
  );
}
