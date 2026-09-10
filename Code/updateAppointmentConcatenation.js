function updateAppointmentConcatenation(executionContext) {
    var formContext = executionContext.getFormContext();
    var admissionId = formContext.data.entity.getId();
    if (!admissionId) {
        console.error("No Admission record ID found.");
        return;
    }
    admissionId = admissionId.replace("{", "").replace("}", "");

    var query = "?$select=cp_appointmentdate" +
                "&$expand=cp_AppointmentLocation($select=cp_location)" +
                "&$filter=_cp_admission_value eq " + admissionId;
    console.log("Query build was successful");

    Xrm.WebApi.retrieveMultipleRecords("cp_appointment", query).then(
        function success(result) {
            var concatenatedText = "";

            for (var i = 0; i < result.entities.length; i++) {
                var appointment = result.entities[i];
                var location = appointment.cp_AppointmentLocation.cp_location || "";
                var dateTimeStr = "";
                if (appointment.cp_appointmentdate) {
                    var dt = new Date(appointment.cp_appointmentdate);
                    dateTimeStr = dt.toLocaleString();
                }

                var recordText = location + " - " + dateTimeStr;
                if (concatenatedText.length > 0) {
                    concatenatedText += ", \n";
                }
                concatenatedText += recordText;
            }

            var updateData = {
                cp_appointment: concatenatedText
            };

            Xrm.WebApi.updateRecord("cp_cp_admission", admissionId, updateData).then(
                function successUpdate() {
                    console.log("Admission record updated successfully with concatenated appointment info.");
                },
                function(error) {
                    console.error("Error updating Admission record: " + error.message);
                }
            );
        },
        function(error) {
            console.error("Error retrieving Appointment records: " + error.message);
        }
    );
}