"use strict";

Router.map(function () {
	this.route('showEvent', {
		path: 'event/:_id',
		template: 'eventPage',
		waitOn: function () {
			return [
				Meteor.subscribe('categories'),
				Meteor.subscribe('courses'),
				Meteor.subscribe('users'),
				Meteor.subscribe('events')
				//Meteor.subscribe('files')
			]
		},
		data: function () {
			
			var event;
			var create = 'create' == this.params._id;
			if (create) {
				var propose = moment().add(1, 'week').startOf('hour');
				event = {
					new: true,
					startdate: propose.toDate(),
					enddate: moment(propose).add(2, 'hour').toDate()
				};
			} else {
				event = Events.findOne({_id: this.params._id});
				if (!event) return {};
			}
			var course = Courses.findOne({_id: event.course_id});
		
			return {
				event: event,
				course: course
			};
		}
	})
});


Template.event.created = function() {
	this.editing = new ReactiveVar(false);
}

Template.event.helpers({
	editing: function() {
		return this.new || Template.instance().editing.get();
	}
});

Template.eventDescritpionEdit.rendered = function() {
	new MediumEditor(this.firstNode);
}





Template.event.events({
	'click button.eventDelete': function () {
		if (pleaseLogin()) return;
		if (confirm("delete event "+"'"+this.title+"'"+"?")) {
			Events.remove(this._id);
		}
		Template.instance().editing.set(false);
	},
	
	'click button.eventEdit': function () {
		if (pleaseLogin()) return;
		Template.instance().editing.set(true);
	},
	
	
	 
	'change .eventFileInput': function(event, template) {
		
		FS.Utility.eachFile(event, function(file) {
	 
	        Files.insert(file, function (err, fileObj) {
		    
		    	
		    	if (err){

	          	} else {
					//adds a single file at a time at the moment
	            	
	            	var fileList = [
	            		{
	            			file : "/cfs/files/files/" + fileObj._id,
	            			filename : fileObj.original.name,
		    				filesize : fileObj.original.size,
	            		}
	            	];
	          		template.files = fileList
	          	}
	        });
		});
	},
	
		
	'click button.saveEditEvent': function(event, instance) {
		if (pleaseLogin()) return;
		function readTime(str, date) {
			var digits = str.replace(/[^0-9]+/g, '');
			if (digits.length > 0) {
				if (digits.length < 3) {
					date.setMinutes(0);
					date.setHours(parseInt(digits, 10));
				} else {
					date.setMinutes(parseInt(digits.substr(2), 10));
					date.setHours(parseInt(digits.substr(0, 2), 10));
				}
			}
		}

		// format startdate
		var startDateParts =  instance.$('#edit_event_startdate').val().split(".");
		if (!startDateParts[2]){
			alert("Date format must be dd.mm.yyyy\n(for example 20.3.2014)");
			return;
		}
		var startdate = new Date(startDateParts[2], (startDateParts[1] - 1), startDateParts[0]);

		var startStr = instance.$('#edit_event_starttime').val();
		readTime(startStr, startdate);


		var now = new Date();
		if (startdate < now) {
			alert("Date must be in future");
			return;
		}

		var enddate = new Date(startdate.getTime()); // Rough approximation

		if (duration){
			var duration = instance.$('#edit_event_duration').val();
			enddate.setMinutes(enddate.getMinutes()+duration);	
		} else {
			var endStr = instance.$('#edit_event_endtime').val()
			readTime(endStr, enddate);

			if (enddate < startdate) {
				enddate = startdate // No questions asked
			}
		}



		
		var editevent = {
			title: instance.$('#edit_event_title').val(),
			description: instance.$('#edit_event_description').html(),
			location: instance.$('#edit_event_location').val(),
			room: instance.$('#edit_event_room').val(),
			startdate: startdate,
			enddate: enddate
			
		}
		
		
		var fileList = instance.files;
		//check if file object is stored in the template object
		if(fileList != null){

			var tmp = []				
			$.each( this.files, function( i,fileObj ){
				tmp.push( fileObj );
			});
			
			$.each( fileList, function( i, fileObj ){
				tmp.push( fileObj );
				//$.extend( editevent.files, filesURL );	
			});
			
			editevent.files = tmp;
		}		
		
		editevent.time_lastedit = now
		
		
		if (this._id) {
			Events.update(this._id, { $set: editevent });
			instance.editing.set(false);
		} else {
			if (this.course_id) {
				editevent.course_id = this.course._id;
				editevent.region = this.course.region;
			} else {
				editevent.region = Session.get('region');
			}
			editevent.createdBy = Meteor.userId()
			editevent.time_created = now
			Events.insert(editevent, function(error, result) {
				if (error) {
					console.log(error);
				} else {
					Router.go('showEvent', { _id: result });
					instance.editing.set(false);
				}
			});
		}
		
	},
	
	'click button.cancelEditEvent': function () {
		if (this.new) history.back();
		Template.instance().editing.set(false);
	},

	'click #toggle_duration': function(event){
		$('#show_time_end').toggle(300);
		$('#show_duration').toggle(300);
	},

});
