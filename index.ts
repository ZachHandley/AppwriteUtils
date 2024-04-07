import { UtilsController } from "./src/utilsController";

const args = process.argv.slice(2);

async function main() {
  const controller = new UtilsController();
  await controller.init();

  if (args.includes("--setup")) {
    // Call setup related methods
  } else if (args.includes("--wipe")) {
    // Call wipe database method
  } else if (args.includes("--generate")) {
    // Call generate schemas method
  } else if (args.includes("--apply")) {
    // Call apply migrations method
  } else {
    console.log("Invalid or no command provided.");
  }
}

main().catch(console.error);
