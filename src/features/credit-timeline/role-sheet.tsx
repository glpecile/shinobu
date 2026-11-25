import { PickerSheet } from '@/components/picker-sheet';

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
