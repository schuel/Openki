

////////////// db-subscriptions:

var regionSub = Meteor.subscribe('regions');
Meteor.subscribe('categories');
Meteor.subscribe('comments');
Meteor.subscribe('discussions');
Meteor.subscribe('locations');
Meteor.subscribe('messages');
Meteor.subscribe('roles');
Meteor.subscribe('votings');
Meteor.subscribe('currentUser');
Meteor.subscribe('files');

// close any verification dialogs still open
Router.onBeforeAction(function() {
	Session.set('verify', false);
	this.next();
});

// Choose default region when none is set
Deps.autorun(function() {
	if (regionSub.ready()) {
		var region = localStorage.getItem("region");
		if (!region || region == 'all') {
			if (Regions.find({}).count() == 1) {
				region = Regions.findOne({})._id;
			} else {
				region = 'all';
			}
		}
		Session.set("region", region);
	}
});

// Use browser language for date formatting
Deps.autorun(function() {
	var desiredLocale = Session.get('locale');
	var setLocale = moment.locale(desiredLocale);
	Session.set('timeLocale', setLocale);
	if (desiredLocale !== setLocale) console.log("Date formatting set to "+setLocale+" because "+desiredLocale+" not available");
});

// Set up reactive date sources that can be used for updates based on time
function setTimes() {
	var now = moment();
	Session.set('coarseTime', ''+moment().startOf('hour').toDate());
	Session.set('fineTime', ''+moment().startOf('minute').toDate());
}
setTimes();

// Update interval of five seconds is okay
Meteor.setInterval(setTimes, 1000*5);
