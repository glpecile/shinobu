# Muting alerts while a notification batch is being replaced

Each kind switch refreshes the schedule immediately. Native cancellation and
scheduling are asynchronous, so two replacements could interleave. An older
replacement could add an alert after a newer mute had cancelled it. The newer
batch's stored hash then caused future refreshes to skip repair.

All batch replacements and master-off cancellations now run through one promise
chain in `features/notifications/scheduler/index.native.ts`. A failed operation
clears the stored hash and lets the next operation run, so the batch can retry.
The refresh also checks the master preference again after gathering inputs.
Otherwise, a refresh started before master-off could recreate the cancelled
batch after its inputs loaded.

The scheduler tests pause a native write while a newer mute or master-off is
requested, and verify that the final schedule is empty. The refresh test covers
master-off during input gathering.
