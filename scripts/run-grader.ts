import 'dotenv/config';

import { gradeAllActiveEtfs } from '../src/lib/grader/run-all';

async function main() {
  const { graded } = await gradeAllActiveEtfs();
  console.log(`Graded ${graded} ETFs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
