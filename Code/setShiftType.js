function setShiftType(executionContext) {
    // Get the form context
    var formContext = executionContext.getFormContext();

    // Retrieve the shift date and time value
    var shiftDateTime = formContext.getAttribute("cp_shiftdateandtime").getValue();
    
    if (shiftDateTime) {
        // Extract the hour from the date (0-23)
        var hour = shiftDateTime.getHours();

        // Check if the time is between 7:00 AM and 7:00 PM
        if (hour >= 7 && hour < 19) {
            formContext.getAttribute("cp_shifttype").setValue("Day Shift");
        } else {
            // Covers time between 7:00 PM and 7:00 AM
            formContext.getAttribute("cp_shifttype").setValue("Night Shift");
        }
    } else {
        // Optionally, clear the shift type if no date is provided
        formContext.getAttribute("cp_shifttype").setValue(null);
    }
}
