import { DDP } from 'meteor/ddp-client';
import { Meteor } from 'meteor/meteor';
import { Promise } from 'meteor/promise';
import { Router } from 'meteor/iron:router';
import { expect } from 'meteor/practicalmeteor:chai';

import { subscriptionsReady, elementsReady } from '/imports/client-utils.app-test.js';

if (Meteor.isClient) {
	describe('Frontpage', function () {
		it('should list 8 courses for unauthenticated user (Testistan)', async function () {
			Router.go('/');
			await subscriptionsReady();
			const titles = await elementsReady(() => {
				const titles = document.getElementsByClassName('course-compact-title');
				if (titles.length === 8) {
					return titles;
				}
			});

			expect(titles[0].textContent).to.equal('Sprachaustausch');
			expect(titles[1].textContent).to.equal('Game Design mit Unity');
			expect(titles[2].textContent).to.equal('Aikido');
			expect(titles[3].textContent).to.equal('Open Lab');
			expect(titles[4].textContent).to.equal('First-Aid Course');
			expect(titles[5].textContent).to.equal('Ubuntu auf Mac (dual-Boot)');
			expect(titles[6].textContent).to.equal('Velo Flicken');
			expect(titles[7].textContent).to.equal('Meteor.js Workshop');
		});
	});
}
