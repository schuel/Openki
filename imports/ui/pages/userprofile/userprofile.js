import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';

import Roles from '/imports/api/roles/roles.js';

import ShowServerError from '/imports/ui/lib/show-server-error.js';
import { AddMessage } from '/imports/api/messages/methods.js';
import { HasRoleUser } from '/imports/utils/course-role-utils.js';

import '/imports/ui/components/profiles/course-list/profile-course-list.js';
import '/imports/ui/components/profiles/verify-email/verify-email.js';

import './userprofile.html';

Template.userprofile.helpers({
	// whether userprofile is for the logged-in user
	ownuser: function () {
		return this.user && this.user._id === Meteor.userId();
	},

	acceptsMessages: function() {
		return this.user
			&& this.user.acceptsMessages;
	},

	groupMember: function(group, user) {
		return user && group && group.members && group.members.indexOf(user._id) >= 0;
	},

	showInviteGroups: function() {
		return this.inviteGroups.count && this.inviteGroups.count() > 0;
	},

	showSettings: function() {
		var showPrivileges = Template.instance().data.showPrivileges;
		var showInviteGroups = this.inviteGroups.count && this.inviteGroups.count() > 0;
		return showPrivileges || showInviteGroups;
	},
	roles: function() {
		return _.clone(Roles).reverse();
	},
	coursesByRole: function(role) {
		var templateData = Template.instance().data;
		var involvedIn = templateData.involvedIn;
		var userID = templateData.user._id;
		var coursesForRole = [];

		involvedIn.forEach(function(course) {
			if(!!HasRoleUser(course.members, role, userID)) {
				coursesForRole.push(course);
			}
		});
		return coursesForRole;
	},
	roleUserList: function() {
		return 'roles.'+this.type+'.userList';
	},
	getName: function() {
		return Template.instance().data.user.username;
	}
});


Template.userprofile.events({
	'click button.giveAdmin': function() {
		Meteor.call('user.addPrivilege', this.user._id, 'admin', function(err) {
			if (err) {
				ShowServerError('Unable to add privilege', err);
			} else {
				AddMessage(mf('privilege.addedAdmin', 'Granted admin privilege'), 'success');
			}
		});
	},

	'click .js-remove-privilege-btn': function(event, template) {
		var priv = template.$(event.target).data('priv');
		Meteor.call('user.removePrivilege', this.user._id, priv, function(err) {
			if (err) {
				ShowServerError('Unable to remove privilege', err);
			} else {
				AddMessage(mf('privilege.removed', 'Removed privilege'), 'success');
			}
		});
	},

	'click button.draftIntoGroup': function(event, template) {
		var groupId = this._id;
		var name = this.name;
		var userId = Template.parentData().user._id;
		Meteor.call('group.updateMembership', userId, groupId, true, function(err) {
			if (err) {
				ShowServerError('Unable to draft user into group', err);
			} else {
				AddMessage(mf('profile.group.drafted', { NAME: name }, 'Added to group {NAME}'), 'success');
			}
		});
	},

	'click .js-group-expel-btn': function(event, template) {
		Tooltips.hide();
		var groupId = this._id;
		var name = this.name;
		var userId = Template.parentData().user._id;
		Meteor.call('group.updateMembership', userId, groupId, false, function(err) {
			if (err) {
				ShowServerError('Unable to expel user from group', err);
			} else {
				AddMessage(mf('profile.group.expelled', { NAME: name }, 'Expelled from group {NAME}'), 'success');
			}
		});
	},
});
