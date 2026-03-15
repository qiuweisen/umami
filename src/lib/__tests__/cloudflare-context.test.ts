import { getCloudflareContext } from '../cloudflare-context';

test('getCloudflareContext returns undefined by default', () => {
  expect(getCloudflareContext()).toBeUndefined();
});
