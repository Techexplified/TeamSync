/* global TrelloPowerUp */

var ICON = window.location.origin + '/favicon.svg';

if (window.TrelloPowerUp) {
  window.TrelloPowerUp.initialize({
    'card-badges': function (t) {
      return t.get('card', 'shared', 'teamsync')
        .then(function (data) {
          if (!data || !data.owner) {
            return [{
              text: '⚠️ Needs Owner',
              color: 'red'
            }];
          }

          if (data.handoff && data.handoff.status === 'pending') {
            var recipientName = data.handoff.toMember ? data.handoff.toMember.fullName.split(' ')[0] : 'Member';
            return [{
              text: '⏳ Handoff → ' + recipientName,
              color: 'yellow'
            }];
          }

          return [{
            text: '👤 ' + data.owner.fullName.split(' ')[0],
            color: 'blue'
          }];
        });
    },

    'card-detail-badges': function (t) {
      return t.get('card', 'shared', 'teamsync')
        .then(function (data) {
          if (!data || !data.owner) {
            return [{
              title: 'Task Owner',
              text: 'Unassigned',
              color: 'red'
            }];
          }

          var badges = [{
            title: 'Primary Owner',
            text: data.owner.fullName,
            color: 'blue'
          }];

          if (data.handoff && data.handoff.status === 'pending') {
            badges.push({
              title: 'Handoff Status',
              text: 'Pending (' + (data.handoff.toMember ? data.handoff.toMember.fullName : 'Next') + ')',
              color: 'yellow'
            });
          }

          return badges;
        });
    },

    'card-buttons': function () {
      return [{
        icon: ICON,
        text: 'TeamSync Owner',
        callback: function (tBtn) {
          return tBtn.popup({
            title: 'TeamSync Task Ownership',
            url: tBtn.signUrl ? tBtn.signUrl('./index.html?view=card-back') : './index.html?view=card-back',
            height: 380
          });
        }
      }];
    },

    'card-back-section': function (t) {
      return {
        title: 'TeamSync Task Ownership',
        icon: ICON,
        content: {
          type: 'iframe',
          url: t.signUrl ? t.signUrl('./index.html?view=card-back') : './index.html?view=card-back',
          height: 380
        }
      };
    },

    'board-buttons': function () {
      return [{
        icon: {
          dark: ICON,
          light: ICON
        },
        text: 'TeamSync Overview',
        callback: function (tModal) {
          return tModal.modal({
            url: tModal.signUrl ? tModal.signUrl('./index.html?view=overview'),
            title: 'TeamSync : Board Overview',
            accentColor: '#0052CC',
            fullscreen: true
          });
        }
      }];
    }
  });
}

