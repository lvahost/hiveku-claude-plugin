// Loaded into every plugin process a test starts (test/isolated.mjs puts it in
// NODE_OPTIONS), so a spawned bin/hiveku gets the same fake as the test itself
// and reaches no keychain tool even if its PATH is wrong.
import { setKeychainForTests } from '../lib/credentials.mjs';

setKeychainForTests({ get: async () => null, set: async () => false });
