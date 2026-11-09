/* global TrelloPowerUp */

var ICON = window.location.origin + '/favicon.svg';

function getThresholdHours(settings) {
  if (settings && typeof settings === 'object' && settings.escalationThresholdHours) {
    var val = Number(settings.escalationThresholdHours);
    if (!isNaN(val) && val > 0) return val;
  }
  return 24;
}

if (window.TrelloPowerUp) {
  window.TrelloPowerUp.initialize({
    'card-badges': function (t) {
      return Promise.all([
        t.get('card', 'shared', 'teamsync'),
        t.get('board', 'shared', 'teamsync_settings').catch(function () { return null; })
      ]).then(function (results) {
        var data = results[0];
        var thresholdHours = getThresholdHours(results[1]);

        if (!data || !data.owner) {
          return [{
            text: '⚠️ Needs Owner',
            color: 'red'
          }];
        }

        if (data.handoff && data.handoff.status === 'pending') {
          var recipientName = data.handoff.toMember ? data.handoff.toMember.fullName.split(' ')[0] : 'Member';
          var createdMs = data.handoff.createdAt ? new Date(data.handoff.createdAt).getTime() : Date.now();
          var elapsedHours = (Date.now() - createdMs) / (1000 * 60 * 60);

          if (elapsedHours >= thresholdHours) {
            return [{
              text: '🚨 Escalated → ' + recipientName,
              color: 'red'
            }];
          }

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
      return Promise.all([
        t.get('card', 'shared', 'teamsync'),
        t.get('board', 'shared', 'teamsync_settings').catch(function () { return null; })
      ]).then(function (results) {
        var data = results[0];
        var settings = results[1];
        var thresholdHours = getThresholdHours(settings);
        var contactId = settings && typeof settings === 'object' ? settings.escalationContactId : '';

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
          var createdMs = data.handoff.createdAt ? new Date(data.handoff.createdAt).getTime() : Date.now();
          var elapsedHours = (Date.now() - createdMs) / (1000 * 60 * 60);
          var escalated = elapsedHours >= thresholdHours;
          var recipient = data.handoff.toMember ? data.handoff.toMember.fullName : 'Next';

          badges.push({
            title: escalated ? 'Escalated Handoff' : 'Handoff Status',
            text: escalated ? ('Needs Attention (' + recipient + ')') : ('Pending (' + recipient + ')'),
            color: escalated ? 'red' : 'yellow'
          });

          if (escalated && (contactId || (data.handoff.escalationNotifiedTo && data.handoff.escalationNotifiedTo.fullName))) {
            return t.board('members').then(function (board) {
              var contact = (board && board.members ? board.members : []).filter(function (m) {
                return m.id === contactId;
              })[0];
              var managerName = (contact && contact.fullName) ||
                (data.handoff.escalationNotifiedTo && data.handoff.escalationNotifiedTo.fullName) ||
                'Escalation Lead';
              badges.push({
                title: 'Escalation Lead Alerted',
                text: managerName,
                color: 'red'
              });
              return badges;
            }).catch(function () {
              return badges;
            });
          }
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
            height: 440
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
          height: 420
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
            url: tModal.signUrl ? tModal.signUrl('./index.html?view=overview') : './index.html?view=overview',
            title: 'TeamSync : Board Overview',
            accentColor: '#2563EB',
            fullscreen: true
          });
        }
      }];
    }
  });
}
