// ======== DB-Model: ========
// "_id"           -> ID
// "name"          -> String
// "categories"    -> [ID_categories]
// "tags"          -> List of Strings  (not used)
// "groups"        -> List ID_groups
// groupOrganizers List of group ID that are allowed to edit the course
// "description"   -> String
// "slug"          -> String
// "region"        -> ID_region
// "date"          -> Date             (what for?)
// "createdby"     -> ID_user
// "time_created"  -> Date
// "time_lastedit" -> Date
// "roles"         -> [role-keys]
// "members"       -> [{"user":ID_user,"roles":[role-keys]},"comment":string]
// "internal"      -> Boolean

/** Calculated fields
  *
  * editors: List of user and group id allowed to edit the course, calculated from members and groupOrganizers
  * futureEvents: count of events still in the future for this course
  * nextEvent: next upcoming event object, only includes the _id and start field
  * lastEvent: most recent event object, only includes the _id and start field
  */


Course = function() {
	this.members = [];
	this.roles = [];
	this.groupOrganizers = [];
};


/** Check whether a user may edit the course.
  *
  * @param {Object} user
  * @return {Boolean}
  */
Course.prototype.editableBy = function(user) {
	if (!user) return false;
	var isNew = !this._id;

	return isNew // Anybody may create a new course
		|| privileged(user, 'admin') // Admins can edit all courses
		|| _.intersection(user.badges, this.editors).length > 0;
};

Courses = new Meteor.Collection("Courses", {
	transform: function(course) {
		return _.extend(new Course(), course);
	}
});


function addRole(course, role, user) {
	// Add the user as member if she's not listed yet
	Courses.update(
		{ _id: course._id, 'members.user': { $ne: user } },
		{ $addToSet: { 'members': { user: user, roles: [ role ]} }}
	);

	Courses.update(
		{ _id: course._id, 'members.user': user },
		{ '$addToSet': { 'members.$.roles': role }}
	);

	Courses.updateGroups(course._id);
}


function removeRole(course, role, user) {
	Courses.update(
		{ _id: course._id, 'members.user': user },
		{ '$pull': { 'members.$.roles': role }}
	);

	// Housekeeping: Remove members that have no role left
	Courses.update(
		{ _id: course._id },
		{ $pull: { members: { roles: { $size: 0 } }}}
	);

	Courses.updateGroups(course._id);
}

/** @summary Determine whether there is a member with the given role
  * @param members list of members
  * @param role role key
  * @return true if there is a member with the given role, and false otherwise.
  */
hasRole = function(members, role) {
	if (!members) return false;
	return members.some(function(member) {
		return member.roles.indexOf(role) !== -1;
	});
};

/** @summary Determine whether a given user has a given role in a members list
  * @param members list of members
  * @param role role key
  * @param userId user ID to check
  * @return whether the user has this role
  */
hasRoleUser = function(members, role, userId) {
	var matchRole = function(member) {
		return member.user == userId
		    && member.roles.indexOf(role) !== -1;
	};

	return members.some(matchRole);
};

maySubscribe = function(operatorId, course, userId, role) {
	if (!userId) return false;

	// Do not allow subscribing when already subscribed
	if (hasRoleUser(course.members, role, userId)) return false;

	// Admins may do anything
	if (privileged(operatorId, 'admin')) {
		return true;
	}

	// The team role is restricted
	if ('team' === role) {
		// If there are no team-members, anybody can join
		if (!hasRole(course.members, 'team')) {
			return operatorId === userId;
		}

		// Only members of the team can take-on other people
		if (hasRoleUser(course.members, 'team', operatorId)) {
			// Only participating users can be drafted
			var candidateRoles = ['participant', 'mentor', 'host'];

			// In for a penny, in for a pound
			for (var p in candidateRoles) {
				if (hasRoleUser(course.members, candidateRoles[p], userId)) return true;
			}
		}
		return false;
	}

	// The other roles can only be chosen by the users themselves
	if (operatorId !== userId) return false;

	return true;
};

mayUnsubscribe = function(operatorId, course, userId, role) {
	if (!userId) return false;

	// Do not allow unsubscribing when not subscribed
	if (!hasRoleUser(course.members, role, userId)) return false;

	// Admins may do anything
	if (privileged(operatorId, 'admin')) {
		return true;
	}

	// The team role is restricted
	if ('team' === role) {

		// Only members of the team can take-out other people
		return hasRoleUser(course.members, 'team', operatorId);
	}

	// The other roles can only be chosen by the users themselves
	return operatorId === userId;
};

// Update list of editors
Courses.updateGroups = function(courseId) {
	untilClean(function() {
		var course = Courses.findOne(courseId);
		if (!course) return true; // Yes Mylord the nonexisting course was duly updated please don't throw a tantrum

		var editors = course.groupOrganizers.slice();

		course.members.forEach(function(member) {
			if (member.roles.indexOf('team') >= 0) {
				editors.push(member.user);
			}
		});

		// We have to use the Mongo collection API because Meteor does not
		// expose the modification counter
		var rawCourses = Courses.rawCollection();
		var result = Meteor.wrapAsync(rawCourses.update, rawCourses)(
			{ _id: course._id },
			{ $set: { editors: editors } },
			{ fullResult: true }
		);
		return result.result.nModified === 0;
	});

	// At some point we'll have to figure out a proper caching hierarchy
	Meteor.call('event.updateGroups', { courseId: courseId });
};


coursesFind = function(filter, limit) {
	var find = {};
	var sort = {time_lastedit: -1, time_created: -1};
	if (filter.region && filter.region != 'all') find.region = filter.region;

	if (filter.upcomingEvent === true) {
		find.futureEvents = { $gt: 0 };
		sort = {"nextEvent.start": 1, time_lastedit: -1};
	}
	if (filter.upcomingEvent === false) {
		find.futureEvents = 0;
	}

	var mustHaveRoles = [];
	var missingRoles = [];

	if (filter.needsHost) {
		missingRoles.push('host');
		mustHaveRoles.push('host');
	}

	if (filter.needsMentor) {
		missingRoles.push('mentor');
		mustHaveRoles.push('mentor');
	}

	if (filter.missingTeam) {
		missingRoles.push('team');
		// All courses have the team role so we don't need to restrict to those having it
	}

	if (filter.userInvolved) {
		find['members.user'] = filter.userInvolved;
	}

	if (filter.categories) {
		find.categories = { $all: filter.categories };
	}

	if (filter.group) {
		find.groups = filter.group;
	}

	if (missingRoles.length > 0) {
		find['members.roles'] = { $nin: missingRoles };
	}

	if (mustHaveRoles.length > 0) {
		find.roles = { $all: mustHaveRoles };
	}

	if (filter.internal !== undefined) {
		find.internal = !!filter.internal;
	}

	if (filter.search) {
		var searchTerms = filter.search.split(/\s+/);
		var searchQueries = _.map(searchTerms, function(searchTerm) {
			return { $or: [
				{ name: { $regex: escapeRegex(searchTerm), $options: 'i' } },
				{ description: { $regex: escapeRegex(searchTerm), $options: 'i' } }
			] };
		});

		find.$and = searchQueries;
	}
	var options = { limit: limit, sort: sort };
	return Courses.find(find, options);
};

if (Meteor.isServer) {
	Meteor.methods({
		add_role: function(courseId, userId, role) {
			check(courseId, String);
			check(userId, String);
			check(role, String);

			var user = Meteor.users.findOne(userId);
			if (!user) throw new Meteor.Error(404, "User not found");

			var operator = Meteor.user();
			if (!operator) throw new Meteor.Error(401, "please log in");

			var course = Courses.findOne({_id: courseId});
			if (!course) throw new Meteor.Error(404, "Course not found");

			if (course.roles.indexOf(role) == -1) throw new Meteor.Error(404, "No role "+role);

			// do nothing if user is allready subscribed with this role
			if (hasRoleUser(course.members, role, userId)) return true;

			// Check permissions
			if (!maySubscribe(operator._id, course, user._id, role)) {
				throw new Meteor.Error(401, "not permitted");
			}

			addRole(course, role, user._id);

			// Update the modification date
			Courses.update(courseId, { $set: {time_lastedit: new Date()} });
		},

		remove_role: function(courseId, userId, role) {
			check(role, String);
			check(userId, String);
			check(courseId, String);

			var user = Meteor.users.findOne(userId);
			if (!user) throw new Meteor.Error(404, "User not found");

			var operator = Meteor.user();
			if (!operator) throw new Meteor.Error(401, "please log in");

			var course = Courses.findOne({_id: courseId});
			if (!course) throw new Meteor.Error(404, "Course not found");

			// do nothing if user is not subscribed with this role
			if (!hasRoleUser(course.members, role, userId)) return true;

			// Check permissions
			 if (!mayUnsubscribe(operator._id, course, user._id, role)) {
				throw new Meteor.Error(401, "not permitted");
			}

			removeRole(course, role, user._id);
		}
	});
}


// The code to update the groups and groupOrganizers field must do the same
// thing for Courses and Events. So we parameterize the methods
// with a collection passed as argument on construction.
UpdateMethods = {
	/** Create an update method for the groups field
	  *
	  * @param {Object} collection - the collection the changes will be applied to when the method is called
	  * @return {function} A function that can be used as meteor method
	  */
	Promote: function(collection) {
		return function(docId, groupId, enable) {
			check(docId, String);
			check(groupId, String);
			check(enable, Boolean);

			var doc = collection.findOne(docId);
			if (!doc) throw new Meteor.Error(404, "Doc not found");

			var group = Groups.findOne(groupId);
			if (!group) throw new Meteor.Error(404, "Group not found");

			var user = Meteor.user();
			if (!user) throw new Meteor.Error(401, "not permitted");

			var mayPromote = user.mayPromoteWith(group._id);
			var mayEdit = doc.editableBy(user);

			var update = {};
			if (enable) {
				// The user is allowed to add the group if she is part of the group
				if (!mayPromote) throw new Meteor.Error(401, "not permitted");
				update.$addToSet = { 'groups': group._id };
			} else {
				// The user is allowed to remove the group if she is part of the group
				// or if she has editing rights on the course
				if (!mayPromote && !mayEdit) throw new Meteor.Error(401, "not permitted");
				update.$pull = { 'groups': group._id, groupOrganizers: group._id };
			}

			collection.update(doc._id, update);
			if (Meteor.isServer) collection.updateGroups(doc._id);
        };
	},

	/** Create an update method for the groupOrganizers field
	  *
	  * @param {Object} collection - the collection the changes will be applied to when the method is called
	  * @return {function} A function that can be used as meteor method
	  */
    Editing: function(collection) {
		return function(docId, groupId, enable) {
			check(docId, String);
			check(groupId, String);
			check(enable, Boolean);

			var doc = collection.findOne(docId);
			if (!doc) throw new Meteor.Error(404, "Doc not found");

			var group = Groups.findOne(groupId);
			if (!group) throw new Meteor.Error(404, "Group not found");

			var user = Meteor.user();
			if (!user || !doc.editableBy(user)) throw new Meteor.Error(401, "Not permitted");

			var update = {};
			var op = enable ? '$addToSet' : '$pull';
			update[op] = { 'groupOrganizers': group._id };

			collection.update(doc._id, update);
			if (Meteor.isServer) collection.updateGroups(doc._id);
		};
	},
};


Meteor.methods({

	change_comment: function(courseId, comment) {
		check(courseId, String);
		check(comment, String);
		var course = Courses.findOne({_id: courseId});
		if (!course) throw new Meteor.Error(404, "Course not found");

		Courses.update(
			{ _id: course._id, 'members.user': Meteor.userId() },
			{ $set: { 'members.$.comment': comment } }
		);
	},

	save_course: function(courseId, changes) {
		check(courseId, String);
		check(changes, {
			description: Match.Optional(String),
			categories:  Match.Optional([String]),
			name:        Match.Optional(String),
			region:      Match.Optional(String),
			roles:       Match.Optional(Object),
			groups:      Match.Optional([String]),
			internal:    Match.Optional(Boolean),
		});

		var user = Meteor.user();
		if (!user) {
			if (Meteor.is_client) {
				pleaseLogin();
				return;
			} else {
				throw new Meteor.Error(401, "please log in");
			}
		}

		var course;
		var isNew = courseId.length === 0;
		if (isNew) {
			course = new Course();
		} else {
			course = Courses.findOne({_id: courseId});
			if (!course) throw new Meteor.Error(404, "Course not found");
		}

		if (!course.editableBy(user)) throw new Meteor.Error(401, "edit not permitted");

		/* Changes we want to perform */
		var set = {};

		if (changes.roles) {
			_.each(Roles, function(roletype) {
				var type = roletype.type;
				var should_have = roletype.preset || changes.roles && changes.roles[type];
				var have = course.roles.indexOf(type) !== -1;

				if (have && !should_have) {
					Courses.update(
						{ _id: courseId },
						{ $pull: { roles: type }},
						checkUpdateOne
					);

					// HACK
					// due to a mongo limitation we can't { $pull { 'members.roles': type } }
					// so we keep removing one by one until there are none left
					while(Courses.update(
						{ _id: courseId, "members.roles": type },
						{ $pull: { 'members.$.roles': type }}
					));
				}
				if (!have && should_have) {
					if (isNew) {
						set.roles = set.roles || [];
						set.roles.push(type);
					} else {
						Courses.update(
							{ _id: courseId },
							{ $addToSet: { roles: type }},
							checkUpdateOne
						);
					}
				}
			});
		}

		if (changes.description) {
			set.description = changes.description.substring(0, 640*1024); /* 640 k ought to be enough for everybody  -- Mao */
			if (Meteor.isServer) {
				set.description = saneHtml(set.description);
			}
		}

		if (changes.categories) set.categories = changes.categories.slice(0, 20);
		if (changes.name) {
			set.name = saneText(changes.name).substring(0, 1000);
			set.slug = getSlug(set.name);
		}
		if (changes.internal !== undefined) {
			set.internal = changes.internal;
		}

		set.time_lastedit = new Date();
		if (isNew) {
			// You can add newly created courses to any group
			var tested_groups = [];
			if (changes.groups) {
				tested_groups = _.map(changes.groups, function(groupId) {
					var group = Groups.findOne(groupId);
					if (!group) throw new Meteor.Error(404, "no group with id "+groupId);
					return group._id;
				});
			}
			set.groups = tested_groups;

			/* region cannot be changed */
			var region = Regions.findOne({_id: changes.region});
			if (!region) throw Meteor.error(404, 'region missing');
			set.region = region._id;

			/* When a course is created, the creator is automatically added as sole member of the team */
			set.members = [{ user: user._id, roles: ['team'], comment: '(has proposed this course)'}];
			set.createdby = user._id;
			set.time_created = new Date();
			courseId = Courses.insert(set);

			Meteor.call('updateNextEvent', courseId);
		} else {
			Courses.update({ _id: courseId }, { $set: set }, checkUpdateOne);
		}

		return courseId;
	},

	remove_course: function(courseId) {
		var course = Courses.findOne({_id: courseId});
		if (!course) throw new Meteor.Error(404, "no such course");
		if (!course.editableBy(Meteor.user())) throw new Meteor.Error(401, "edit not permitted");
		Events.remove({ courseId: courseId });
		Courses.remove(courseId);
	},

	// Update the nextEvent field for the courses matching the selector
	updateNextEvent: function(selector) {
		Courses.find(selector).forEach(function(course) {
			var futureEvents = Events.find(
				{courseId: course._id, start: {$gt: new Date()}}
			).count();

			var nextEvent = Events.findOne(
				{ courseId: course._id, start: {$gt: new Date()} },
				{ sort: {start: 1}, fields: {start: 1, _id: 1, venue: 1} }
			);

			var lastEvent = Events.findOne(
				{ courseId: course._id, start: {$lt: new Date()} },
				{ sort: {start: -1}, fields: {start: 1, _id: 1, venue: 1} }
			);

			Courses.update(course._id, { $set: {
				futureEvents: futureEvents,
				nextEvent: nextEvent,
				lastEvent: lastEvent,
			} });
		});
	},


	/** Add or remove a group from the groups list
	  *
	  * @param {String} courseId - The course to update
	  * @param {String} groupId - The group to add or remove
	  * @param {Boolean} add - Whether to add or remove the group
	  *
	  */
	'course.promote': UpdateMethods.Promote(Courses),


	/** Add or remove a group from the groupOrganizers list
	  *
	  * @param {String} courseId - The course to update
	  * @param {String} groupId - The group to add or remove
	  * @param {Boolean} add - Whether to add or remove the group
	  *
	  */
	'course.editing': UpdateMethods.Editing(Courses),


	// Recalculate the editors field
	'course.updateGroups': function(selector) {
		Courses.find(selector).forEach(function(course) {
			Courses.updateGroups(course._id);
		});
	},
});
