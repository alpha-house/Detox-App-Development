// Paste the code below in the browser console to show a list of the names of all elements in the current Form.

var formContext = Xrm.Page; // fallback if not inside executionContext
var controls = formContext.ui.controls.get();
 
controls.forEach(ctrl => {
    console.log("Control name:", ctrl.getName(), "Control type:", ctrl.getControlType());
});
 