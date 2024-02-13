// Define the result object with sample data
let result = {
  email: "support@emailvalidation.io",
  user: "support",
  tag: "",
  domain: "emailvalidation.io",
  smtp_check: true,
  mx_found: true,
  did_you_mean: "",
  role: true,
  disposable: false,
  score: 0.64,
  state: "deliverable",
  reason: "valid_mailbox",
  free: false,
  format_valid: true,
  catch_all: null,
};

// Event listener for click on submit button
submitBtn.addEventListener("click", async (e) => {
  // Prevent default form submission behavior
  e.preventDefault();

  // Log that the button was clicked
  console.log("Clicked!");

  // Display a loading spinner image
  resultCont.innerHTML = `<img width="123" src="img/loading.svg" alt="">`;

  // API key for EmailValidation API
  let key = "ema_live_rFbag19pQdLEk8APoCDy501PBu9Y2jWxCTaK3UEz";

  // Get the email entered by the user
  let email = document.getElementById("username").value;

  // Construct the URL for the EmailValidation API request
  let url = `https://api.emailvalidation.io/v1/info?apikey=${key}&email=${email}`;

  // Send an asynchronous request to the EmailValidation API
  let res = await fetch(url);

  // Parse the JSON response
  let result = await res.json();

  // Initialize an empty string for constructing HTML
  let str = ``;

  // Iterate over the keys of the response object
  for (key of Object.keys(result)) {
    // Check if the value is not empty
    if (result[key] !== "" && result[key] !== " ") {
      // Concatenate HTML for displaying key-value pair
      str = str + `<div>${key}: ${result[key]}</div>`;
    }
  }

  // Log the constructed HTML string
  console.log(str);

  // Update the content of the result container with the generated HTML
  resultCont.innerHTML = str;
});
