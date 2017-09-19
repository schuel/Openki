import { Meteor } from 'meteor/meteor';
import { expect } from 'meteor/practicalmeteor:chai';
import fetch from 'isomorphic-unfetch';

// In theory this test could actually be run on the server as well. Regrettably
// the test runner starts the server tests before the database is fully
// populated. As a result those tests will very likely time out.
if (Meteor.isClient) {
	describe('GroupApi', function () {
		it('should return JSON response', async function () {
			const groups = Meteor.absoluteUrl('/api/0/json/groups');
			const result = await fetch(groups);

			expect(result.status).to.equal(200);
			expect(result.headers.get('Content-Type')).to.equal('application/json; charset=utf-8');
		});
	});
}
