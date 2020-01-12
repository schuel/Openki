import { Meteor } from 'meteor/meteor';
import { ReactiveDict } from 'meteor/reactive-dict';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';

import Roles from '/imports/api/roles/roles.js';

import Editable from '/imports/ui/lib/editable.js';
import ShowServerError from '/imports/ui/lib/show-server-error.js';
import { AddMessage } from '/imports/api/messages/methods.js';
import {
	HasRoleUser,
	MaySubscribe,
	MayUnsubscribe
} from '/imports/utils/course-role-utils.js';
import UserPrivilegeUtils from '/imports/utils/user-privilege-utils.js';

import '/imports/ui/components/editable/editable.js';
import '/imports/ui/components/profile-link/profile-link.js';
import '/imports/ui/components/send-message/send-message.js';

import './course-members.html';

Template.courseMembers.onCreated(function() {
	this.increaseBy = 10;
	this.membersLimit = new ReactiveVar(this.increaseBy);
});

Template.courseMembers.helpers({
	howManyEnrolled: function() {
		return this.members.length;
	},

	canNotifyAll() {
		const userId = Meteor.userId();
		return userId && HasRoleUser(this.members, 'team', userId);
	},

	ownUserMember() {
		return this.members.find((member) => member.user === Meteor.userId());
	},

	sortedMembers: function() {
		return (
			this.members
			// remove own user if logged in and course member (it then already
			// appears on top)
			.filter((member) => member.user !== Meteor.userId())
			// sort by amount of roles, not counting 'participant' role
			.sort((a, b) => {
				const aRoles = a.roles.filter((role) => role !== 'participant');
				const bRoles = b.roles.filter((role) => role !== 'participant');

				return bRoles.length - aRoles.length;
			})
			// apply limit
			.slice(0, Template.instance().membersLimit.get())
		);
	},

	limited: function() {
		var membersLimit = Template.instance().membersLimit.get();
		return membersLimit && this.members.length > membersLimit;
	}
});

Template.courseMembers.events({
	'click #contactMembers'() {
		$('.course-page-btn.js-discussion-edit').trigger('notifyAll');
	},

	'click .js-show-all-members': function(e, instance) {
		var membersLimit = instance.membersLimit;

		membersLimit.set(membersLimit.get() + instance.increaseBy);
	}
});

Template.courseMember.onCreated(function() {
	var instance = this;
	var courseId = this.data.course._id;

	this.state = new ReactiveDict();
	this.state.setDefault(
		{ showContactModal: false }
	);

	instance.editableMessage = new Editable(
		true,
		function(newMessage) {
			Meteor.call("course.changeComment", courseId, newMessage, function(err, courseId) {
				if (err) {
					ShowServerError('Unable to change your message', err);
				} else {
					AddMessage("\u2713 " + mf('_message.saved'), 'success');
				}
			});
		},
		mf('roles.message.placeholder', 'My interests...')
	);

	instance.autorun(function() {
		var data = Template.currentData();
		instance.editableMessage.setText(data.member.comment);
	});
});

Template.courseMember.helpers({
	ownUserMemberClass() {
		if (this.isOwnUserMember) return 'is-own-user';
    },

	memberRoles() {
		return this.member.roles.filter(role => role !== 'participant');
	},

	roleShort: function() { return 'roles.'+this+'.short'; },

	maySubscribe: function() {
		return MaySubscribe(Meteor.userId(), this.course, this.member.user, 'team');
	},

	rolelistIcon: function(roletype) {
		if (roletype != "participant") {
			return Roles.find((role) => role.type === roletype).icon;
		}
	},

	editableMessage: function() {
		var mayChangeComment = this.member.user === Meteor.userId();
		return mayChangeComment && Template.instance().editableMessage;
	},

	mayUnsubscribeFromTeam: function(label) {
		return label == 'team'
			&& MayUnsubscribe(Meteor.userId(), this.course, this.member.user, 'team');
	},

	showMemberComment() {
		var mayChangeComment = this.member.user === Meteor.userId();
		return this.member.comment || mayChangeComment;
	},

	showContactParticipant() {
		const userId = Meteor.userId();
		if (!userId) return false;

		return userId !== this.member.user;
	}
});

Template.removeFromTeamDropdown.helpers({
	isNotPriviledgedSelf: function() {
		var notPriviledgedUser = !UserPrivilegeUtils.privileged(Meteor.userId(), 'admin');
		return (this.member.user === Meteor.userId() && notPriviledgedUser);
	}
});

Template.courseMember.events({
	'click .js-add-to-team-btn': function(e, template) {
		Meteor.call("course.addRole", this.course._id, this.member.user, 'team', false);
		return false;
	},
	'click .js-remove-team': function(e, template) {
		Meteor.call("course.removeRole", this.course._id, this.member.user, 'team');
		return false;
	},

	'click .js-show-contact-modal'(event, instance) {
		instance.state.set('showContactModal', true);
	}
});

Template.contactParticipantModal.onCreated(function() {
	this.state = new ReactiveDict();
	this.state.setDefault(
		{ messageSent: false }
	);

	this.autorun(() => {
		if (this.state.get('messageSent')) this.$('#contactParticipant').modal('hide');
	});
});

Template.contactParticipantModal.onRendered(function() {
	this.$('#contactParticipant').modal('show');
});

Template.contactParticipantModal.events({
	'hidden.bs.modal #contactParticipant'(event, instance) {
		instance.parentInstance().state.set('showContactModal', false);
	}
});
