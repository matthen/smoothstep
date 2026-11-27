// A short message about saving or rendering, replacing the last one.
import { notifications } from '@mantine/notifications';

export function showMessage(text: string, loading = false) {
  const options = {id: "status", message: text, loading, autoClose: loading ? false : 1500, withCloseButton: !loading};
  // Each is a no-op when the other applies: update needs an existing id, show skips one.
  notifications.update(options);
  notifications.show(options);
}
