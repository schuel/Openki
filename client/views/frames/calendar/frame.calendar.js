Router.map(function () {
	this.route('frameCalendar', {
		path: '/frame/calendar',
		template: 'frameCalendar',
		layoutTemplate: 'frameCalendar',
		onAfterAction: function() {
			document.title = webpagename + ' Calendar';
		}
	});
});

Template.frameCalendar.onCreated(function() {
	var instance = this;

	// create custom property object
	instance.customProperty = function(key, name, selector) {
		return {
			key: key,
			name: name,
			selector: selector
		};
	};

	instance.eventsRendered = new ReactiveVar(false);

	instance.startOfWeek = new ReactiveVar();
	instance.groupedEvents = new ReactiveVar([]);
	instance.days = new ReactiveVar([]);

	this.autorun(function() {
		minuteTime.get();
		instance.startOfWeek.set(moment().startOf('week'));
	});

	this.autorun(function() {
		var filter = Filtering(EventPredicates)
		             .read(Router.current().params.query)
		             .done();

		var filterParams = filter.toParams();
		var startOfWeek = instance.startOfWeek.get();
		filterParams.after = startOfWeek.toDate();

		instance.subscribe('eventsFind', filterParams, 200);

		var events = Events.find({}, {sort: {start: 1}}).fetch();
		var groupedEvents = _.groupBy(events, function(event) {
			return moment(event.start).format('LL');
		});

		instance.groupedEvents.set(groupedEvents);
		instance.days.set(Object.keys(groupedEvents));
	});
});

Template.frameCalendar.helpers({
	'ready': function() {
		return Template.instance().subscriptionsReady();
	},

	'days': function() {
		return Template.instance().days.get();
	},

	'eventsOn': function(day) {
		var groupedEvents = Template.instance().groupedEvents.get();
		return groupedEvents[day];
	}
});

Template.frameCalendar.onRendered(function() {
	var instance = this;

	instance.autorun(function() {
		var eventsRendered = instance.eventsRendered.get();
		if (eventsRendered) {
			var query = Router.current().params.query;
			var customProperty = instance.customProperty;

			var customProperties = [
				customProperty('bgcolor', 'background-color', 'body'),
				customProperty('color', 'color', 'body'),
				customProperty('eventbg', 'background-color', '.frame-calendar-event'),
				customProperty('eventcolor', 'color', '.frame-calendar-event'),
				customProperty('linkcolor', 'color', '.frame-calendar-event a')
			];

			_.forEach(customProperties, function(property) {
				var value = query[property.key];

				if (value) {
					value = '#' + value;
					$(property.selector).css(property.name, value);
				}
			});
		}
	});
});

Template.frameCalendarEvent.events({
	'click .js-toggle-event-details': function(e, instance) {
		var jQueryTarget = $(e.currentTarget);

		jQueryTarget.toggleClass('active');
		jQueryTarget.nextAll('.frame-calendar-event-body').toggle();
		jQueryTarget.children('.frame-calendar-event-time').toggle();
	}
});

Template.frameCalendarEvent.onRendered(function() {
	var eventsRendered = this.parentInstance().eventsRendered;
	if (!eventsRendered.get()) eventsRendered.set(true);
});
