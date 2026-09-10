// Helper: Check if the outcome value is one of the desired values.
function isDesiredOutcome(value) {
    return value === 121570000 || value === 121570001;
}

// Helper: Format a Date object or date string to "YYYY-MM-DD"
function formatDateForEdm(dateValue) {
    if (!dateValue) return null;
    var d = new Date(dateValue);
    var year = d.getFullYear();
    var month = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return year + '-' + month + '-' + day;
}

// OnLoad handler: Store the initial outcome value for later comparison.
function onLoad(executionContext) {
    var formContext = executionContext.getFormContext();
    var outcome = formContext.getAttribute("cp_outcome").getValue();
    window.initialOutcome = outcome;
}

// Main processing function called on Save.
function processAssessment(executionContext) {
    var formContext = executionContext.getFormContext();
    var newOutcome = formContext.getAttribute("cp_outcome").getValue();
    var formType = formContext.ui.getFormType(); // 1: Create, 2: Update, etc.

    if (formType === 1) {
        // New record: if outcome is Admitted or Bed on Hold, create a client record.
        if (isDesiredOutcome(newOutcome)) {
            createClient(formContext);
        }
    } else if (formType === 2) {
        // Update: if the previous outcome was not desired and now it is, create a client record.
        if (!isDesiredOutcome(window.initialOutcome) && isDesiredOutcome(newOutcome)) {
            createClient(formContext);
        }
    }
}

// Function to create a new client (contact) record only if it doesn't already exist.
// When a new client is created, update the current assessment record (cp_assessment)
// by setting cp_newclient to "No" (121570001) and copying the new client into the cp_client lookup.
function createClient(formContext) {
    // Retrieve client values from the assessment form.
    var firstName = formContext.getAttribute("cp_firstname").getValue();
    var lastName = formContext.getAttribute("cp_lastname").getValue();
    var dob = formContext.getAttribute("cp_dateofbirth").getValue();
    var formattedDOB = formatDateForEdm(dob);

    var clientRecord = {
        firstname: firstName,
        lastname: lastName,
        cp_dateofbirth: formattedDOB,
        cp_gender: formContext.getAttribute("cp_gender").getValue(),
        cp_ethnicity: formContext.getAttribute("cp_ethnicity").getValue(),
        cp_firstcontactdate: formatDateForEdm(formContext.getAttribute("cp_firstcontactdate").getValue()),
        // Set cp_createdbyassessment to "Yes" (option value 121570000) as before.
        cp_createdbyassessment: 121570000
    };

    // Build an OData query to check for an existing client.
    // For string fields, values are enclosed in quotes.
    // For the Date field (cp_dateofbirth) we pass the literal without quotes.
    var query = "?$filter=firstname eq '" + firstName +
                "' and lastname eq '" + lastName +
                "' and cp_dateofbirth eq " + formattedDOB;

    Xrm.WebApi.retrieveMultipleRecords("contact", query).then(
        function success(result) {
            if (result.entities && result.entities.length > 0) {
                console.log("Client already exists, no new record created.");
            } else {
                // Client doesn't exist, so create a new record.
                Xrm.WebApi.createRecord("contact", clientRecord).then(
                    function successCreate(clientResult) {
                        console.log("Client record created with ID: " + clientResult.id);
                        // Get the current assessment record ID.
                        var assessmentId = formContext.data.entity.getId();
                        // Prepare the update payload:
                        // Set cp_newclient to "No" (option value 121570001) and update the cp_client lookup.
                        var updatePayload = {
                            cp_newclient: 121570001,
                            "cp_Client@odata.bind": "/contacts(" + clientResult.id.replace('{','').replace('}','') + ")"
                        };
                        Xrm.WebApi.updateRecord("cp_assessment", assessmentId, updatePayload).then(
                            function successUpdate(updateResult) {
                                console.log("Assessment record updated with client reference and cp_newclient set to No.");
                            },
                            function (updateError) {
                                console.log("Error updating assessment record: " + updateError.message);
                            }
                        );
                    },
                    function (error) {
                        console.log("Error creating client record: " + error.message);
                    }
                );
            }
        },
        function(error) {
            console.log("Error retrieving client record: " + error.message);
        }
    );
}
