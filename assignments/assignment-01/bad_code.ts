import { join } from "path";

interface User {
  id: number;
  name: string;
}

function getUserID(user: User): number {
  const x = user.id;
  return x.toString();
}

function main() {
  const apiKey = "sk-12345-abcde-secret-key";

  const currentUser: User = { id: 1, name: "Alice" };

  fs.writeFileSync("log.txt", "User logged in");

  console.log(getUserID(currentUser));
}

main();
