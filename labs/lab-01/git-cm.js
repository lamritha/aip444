const date = new Date();

const formattedDate = 
  now.getFullYear() + "-" +
  String(now.getMonth() + 1).padStart(2, "0") + "-" +
  String(now.getDate()).padStart(2, "0") + " " +
  String(now.getHours()).padStart(2, "0") + ":" +
  String(now.getMinutes()).padStart(2, "0") + ":" +
  String(now.getSeconds()).padStart(2, "0");

console.log("git-cm: Developed by Amritha Lingeswaran - 116682246");
console.log("Run Date: " + formattedDate);
console.log("--------------------------------------------------------------");

require('dotenv').config({path: require('path').resolve(__dirname, '../../.env')});

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY){
    console.log('❌ Error: OPENROUTER_API_KEY not found');
    process.exit(1);
}